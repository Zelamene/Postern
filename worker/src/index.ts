interface Env {
  POSTERN_KV: KVNamespace;
  INGEST_ENDPOINT: string;
  INGEST_SECRET: string;
  API_BASE_URL: string;
  JOB_SECRET: string;
  POSTERN_OUTCOMES?: AnalyticsEngineDataset;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
}

/**
 * QR4.3: one data point per mail-path outcome. The index is the outcome so the
 * monthly SQL query can group on index1; blob1 carries the drop reason (empty for
 * forwarded and errored), and double1 is always 1. Analytics Engine is used rather
 * than KV because the mail path may not add a KV write (QR2.4 / QR3.2).
 */
export const OUTCOMES = {
  forwarded: "forwarded",
  dropped: "dropped",
  errored: "errored"
} as const;

export const OUTCOMES_DATASET = "Postern_NFR_TESTS";
export const MONTHLY_OUTCOMES_CRON = "0 4 1 * *";
export const MAIL_PATH_SUMMARY_KEY = "mail_path_last_month";

interface AliasKvRecord {
  destination: string;
  status: string;
  userId: string;
  blockedSenders?: string[];
}

interface GlobalBlocklist {
  domains: string[];
}

interface SuspendedUsers {
  users: Record<string, boolean>;
}

interface RateLimitedUsers {
  users: Record<string, number>;
}

const SECOND_LEVEL_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "net.uk", "com.au", "net.au", "org.au"
]);

/**
 * Reason codes recorded against a blocked_messages row for a known alias.
 * shared/blocked-reasons.json is the cross-runtime contract for this list: the
 * Worker suite asserts this object matches it, and the API suite asserts every
 * code round-trips into a row. Adding a drop path means adding a code here.
 */
export const BLOCKED_REASONS = {
  disabledOrReplaced: "disabled_or_replaced",
  rateLimited: "rate_limited",
  globalBlocklist: "global_blocklist",
  blockedSender: "blocked_sender",
  suspendedUser: "suspended_user"
} as const;

function recordOutcome(env: Env, outcome: string, reason = ""): void {
  const dataset = env.POSTERN_OUTCOMES;
  if (!dataset) {
    // Older deployments and the unit fakes have no analytics binding. A missing
    // metric must never change a mail decision.
    return;
  }

  try {
    dataset.writeDataPoint({
      indexes: [outcome],
      blobs: [reason],
      doubles: [1]
    });
  } catch {
    // Same rule as ingest failure: counters are best effort and must never stop
    // forwarding or surface as an unhandled rejection.
  }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const to = message.to;
    if (!to) {
      return;
    }

    const aliasKey = to.toLowerCase();
    const aliasRecord = await env.POSTERN_KV.get(aliasKey, { type: "json", cacheTtl: 60 }) as AliasKvRecord | null;

    if (!aliasRecord) {
      // Unknown recipients are dropped before any alias is known, so there is
      // nothing to attach a blocked row to. This is deliberate: the domain
      // accepts mail for any address, and recording each unknown recipient
      // would hand an attacker an unbounded write surface. Such mail is counted
      // as a silent drop, not a postern user's message. The aggregate counter has
      // no address, so it does not create the unbounded write surface the blocked
      // row would.
      recordOutcome(env, OUTCOMES.dropped, "unknown_recipient");
      return;
    }

    if (aliasRecord.status === "disabled" || aliasRecord.status === "replaced") {
      await recordBlocked(message, aliasRecord, env, ctx, BLOCKED_REASONS.disabledOrReplaced);
      return;
    }

    const [globalBlocklist, suspendedUsers, rateLimitedUsers] = await Promise.all([
      env.POSTERN_KV.get("__global_blocklist", { type: "json", cacheTtl: 60 }) as Promise<GlobalBlocklist | null>,
      env.POSTERN_KV.get("suspended_users", { type: "json", cacheTtl: 60 }) as Promise<SuspendedUsers | null>,
      env.POSTERN_KV.get("rate_limited_users", { type: "json", cacheTtl: 60 }) as Promise<RateLimitedUsers | null>
    ]);

    if (suspendedUsers?.users && suspendedUsers.users[aliasRecord.userId]) {
      await recordBlocked(message, aliasRecord, env, ctx, BLOCKED_REASONS.suspendedUser);
      return;
    }

    if (rateLimitedUsers?.users && rateLimitedUsers.users[aliasRecord.userId]) {
      const until = rateLimitedUsers.users[aliasRecord.userId];
      if (until && until > Date.now() / 1000) {
        await recordBlocked(message, aliasRecord, env, ctx, BLOCKED_REASONS.rateLimited);
        return;
      }
    }

    const fromHeader = message.headers.get("from") || message.from || "";
    const senderDomain = extractEtld1(fromHeader);

    if (globalBlocklist?.domains && senderDomain && globalBlocklist.domains.includes(senderDomain)) {
      await recordBlocked(message, aliasRecord, env, ctx, BLOCKED_REASONS.globalBlocklist);
      return;
    }

    if (aliasRecord.blockedSenders && senderDomain && aliasRecord.blockedSenders.includes(senderDomain)) {
      await recordBlocked(message, aliasRecord, env, ctx, BLOCKED_REASONS.blockedSender);
      return;
    }

    try {
      await message.forward(aliasRecord.destination);
      recordOutcome(env, OUTCOMES.forwarded);
    } catch (error) {
      recordOutcome(env, OUTCOMES.errored);
      console.warn("Postern could not forward a policy-permitted message", error);
      return;
    }

    ctx.waitUntil(ingestMessage(message, aliasRecord, fromHeader, env));
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    if (controller.cron === MONTHLY_OUTCOMES_CRON) {
      ctx.waitUntil(aggregatePreviousMonth(env));
      return;
    }

    if (controller.cron === "5 3 * * *") {
      ctx.waitUntil(
        fetch(`${env.API_BASE_URL}/api/jobs/nightly`, {
          method: "POST",
          headers: { "X-Postern-Job-Secret": env.JOB_SECRET }
        })
      );
      return;
    }

    ctx.waitUntil(fetch(`${env.API_BASE_URL}/health`));
  }
};

async function ingestMessage(
  message: ForwardableEmailMessage,
  aliasRecord: AliasKvRecord,
  fromHeader: string,
  env: Env
): Promise<void> {
  try {
    const authResults = message.headers.get("Authentication-Results") || "";
    let authenticationResult = "unknown";
    if (authResults.toLowerCase().includes("dkim=pass") || authResults.toLowerCase().includes("spf=pass")) {
      authenticationResult = "pass";
    } else if (authResults.toLowerCase().includes("fail")) {
      authenticationResult = "fail";
    } else if (authResults.toLowerCase().includes("none")) {
      authenticationResult = "none";
    }

    const subject = message.headers.get("subject") || "";
    const envelopeSender = message.from || "";
    const messageId = message.headers.get("message-id");

    const response = await fetch(env.INGEST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Postern-Ingest-Secret": env.INGEST_SECRET
      },
      body: JSON.stringify({
        recipientAddress: message.to,
        envelopeSender,
        fromHeader,
        subject,
        authenticationResult,
        messageId
      })
    });

    if (!response.ok) {
      console.warn(
        `Postern ingest rejected the activity record with HTTP ${response.status}; ` +
        "the message was forwarded but not recorded"
      );
    }
  } catch (error) {
    // Forwarding already happened. Losing the activity record must not surface as an
    // unhandled rejection, but it must not disappear silently either: this is the only
    // signal that a forwarded message has no audit row.
    console.warn(
      "Postern ingest call failed; the message was forwarded but not recorded",
      error
    );
  }
}

async function recordBlocked(
  message: ForwardableEmailMessage,
  aliasRecord: AliasKvRecord,
  env: Env,
  ctx: ExecutionContext,
  reason: string
): Promise<void> {
  const fromHeader = message.headers.get("from") || message.from || "";
  recordOutcome(env, OUTCOMES.dropped, reason);
  ctx.waitUntil(ingestBlocked(message, aliasRecord, fromHeader, reason, env));
}

async function ingestBlocked(
  message: ForwardableEmailMessage,
  aliasRecord: AliasKvRecord,
  fromHeader: string,
  reason: string,
  env: Env
): Promise<void> {
  try {
    const authResults = message.headers.get("Authentication-Results") || "";
    let authenticationResult = "unknown";
    if (authResults.toLowerCase().includes("dkim=pass") || authResults.toLowerCase().includes("spf=pass")) {
      authenticationResult = "pass";
    } else if (authResults.toLowerCase().includes("fail")) {
      authenticationResult = "fail";
    } else if (authResults.toLowerCase().includes("none")) {
      authenticationResult = "none";
    }

    const subject = message.headers.get("subject") || "";
    const messageId = message.headers.get("message-id");

    await fetch(env.INGEST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Postern-Ingest-Secret": env.INGEST_SECRET
      },
      body: JSON.stringify({
        recipientAddress: message.to,
        envelopeSender: message.from || "",
        fromHeader,
        subject,
        authenticationResult,
        messageId,
        blocked: true,
        reason
      })
    });
  } catch {
  }
}

/**
 * Parses the registrable domain (eTLD+1) of a sender header. Exported so the shared parity
 * fixture in shared/etld1-cases.json can pin it against the .NET implementation.
 */
export function extractEtld1(header: string): string | null {
  if (!header) {
    return null;
  }

  const atIndex = header.lastIndexOf("@");
  if (atIndex === -1) {
    return null;
  }

  const domainCandidate = header.slice(atIndex + 1).split(/[\s<>@,;:"]/)[0];
  if (!domainCandidate) {
    return null;
  }

  let domain = domainCandidate.toLowerCase();
  while (domain.endsWith(".")) {
    domain = domain.slice(0, -1);
  }

  const parts = domain.split(".");
  if (parts.length <= 2) {
    return parts.join(".");
  }

  const lastTwo = parts.slice(-2).join(".");
  return SECOND_LEVEL_TLDS.has(lastTwo)
    ? parts.slice(-3).join(".")
    : lastTwo;
}

/** The UTC half-open window for the calendar month before `now`. */
export function previousMonthWindow(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  };
}

/**
 * Analytics Engine's SQL API accepts 'YYYY-MM-DD hh:mm:ss' in toDateTime. Derived
 * entirely from Date values, so no caller-supplied text reaches the query except
 * the dataset identifier, which is checked as a plain SQL identifier.
 */
export function buildOutcomesQuery(
  start: Date,
  end: Date,
  dataset: string = OUTCOMES_DATASET
): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(dataset)) {
    throw new Error("Invalid Analytics Engine dataset identifier");
  }

  const stamp = (date: Date) => date.toISOString().slice(0, 19).replace("T", " ");
  return [
    "SELECT index1 AS outcome, SUM(_sample_interval) AS n",
    `FROM ${dataset}`,
    `WHERE timestamp >= toDateTime('${stamp(start)}')`,
    `AND timestamp < toDateTime('${stamp(end)}')`,
    "GROUP BY index1",
    "FORMAT JSON"
  ].join("\n");
}

export interface MailPathSummary {
  windowStart: string;
  windowEnd: string;
  forwarded: number;
  dropped: number;
  errored: number;
  /** forwarded / (forwarded + errored), or null when no eligible mail was seen. */
  mailPathPct: number | null;
  generatedAt: string;
}

interface OutcomeCountRow {
  outcome?: unknown;
  n?: unknown;
}

/**
 * Runs on the first of each month. Counts the previous UTC month from Analytics
 * Engine and stores one summary KV record. The single monthly KV write is outside
 * the per-message budget, so QR2.4's 0 writes and QR3.2's daily cap are untouched.
 */
async function aggregatePreviousMonth(env: Env): Promise<void> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    console.warn(
      "Postern monthly outcome aggregation skipped: CF_ACCOUNT_ID and CF_API_TOKEN must be set"
    );
    return;
  }

  try {
    const { start, end } = previousMonthWindow(new Date());
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/analytics_engine/sql`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CF_API_TOKEN}`,
          "Content-Type": "text/plain"
        },
        body: buildOutcomesQuery(start, end)
      }
    );

    if (!response.ok) {
      console.warn(`Postern monthly outcome aggregation failed with HTTP ${response.status}`);
      return;
    }

    const payload = await response.json() as { data?: OutcomeCountRow[] };
    const counts = { forwarded: 0, dropped: 0, errored: 0 };
    for (const row of payload.data ?? []) {
      const outcome = row.outcome;
      if (outcome === OUTCOMES.forwarded || outcome === OUTCOMES.dropped || outcome === OUTCOMES.errored) {
        counts[outcome] = Number(row.n) || 0;
      }
    }

    const eligible = counts.forwarded + counts.errored;
    const summary: MailPathSummary = {
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      forwarded: counts.forwarded,
      dropped: counts.dropped,
      errored: counts.errored,
      mailPathPct: eligible === 0 ? null : (counts.forwarded / eligible) * 100,
      generatedAt: new Date().toISOString()
    };

    await env.POSTERN_KV.put(MAIL_PATH_SUMMARY_KEY, JSON.stringify(summary));
  } catch (error) {
    console.warn("Postern monthly outcome aggregation failed", error);
  }
}
