interface Env {
  POSTERN_KV: KVNamespace;
  INGEST_ENDPOINT: string;
  INGEST_SECRET: string;
  API_BASE_URL: string;
  JOB_SECRET: string;
  POSTERN_DOMAIN: string;
}

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

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const to = message.to;
    if (!to) {
      return;
    }

    const aliasKey = to.toLowerCase();
    const aliasRecord = await env.POSTERN_KV.get(aliasKey, { type: "json", cacheTtl: 60 }) as AliasKvRecord | null;

    if (!aliasRecord) {
      return;
    }

    if (aliasRecord.status === "disabled" || aliasRecord.status === "replaced") {
      await recordBlocked(message, aliasRecord, env, ctx, "disabled_or_replaced");
      return;
    }

    const [globalBlocklist, suspendedUsers, rateLimitedUsers] = await Promise.all([
      env.POSTERN_KV.get("__global_blocklist", { type: "json", cacheTtl: 60 }) as Promise<GlobalBlocklist | null>,
      env.POSTERN_KV.get("suspended_users", { type: "json", cacheTtl: 60 }) as Promise<SuspendedUsers | null>,
      env.POSTERN_KV.get("rate_limited_users", { type: "json", cacheTtl: 60 }) as Promise<RateLimitedUsers | null>
    ]);

    if (suspendedUsers?.users && suspendedUsers.users[aliasRecord.userId]) {
      return;
    }

    if (rateLimitedUsers?.users && rateLimitedUsers.users[aliasRecord.userId]) {
      const until = rateLimitedUsers.users[aliasRecord.userId];
      if (until && until > Date.now() / 1000) {
        await recordBlocked(message, aliasRecord, env, ctx, "rate_limited");
        return;
      }
    }

    const fromHeader = message.headers.get("from") || message.from || "";
    const senderDomain = extractEtld1(fromHeader);

    if (globalBlocklist?.domains && senderDomain && globalBlocklist.domains.includes(senderDomain)) {
      await recordBlocked(message, aliasRecord, env, ctx, "global_blocklist");
      return;
    }

    if (aliasRecord.blockedSenders && senderDomain && aliasRecord.blockedSenders.includes(senderDomain)) {
      await recordBlocked(message, aliasRecord, env, ctx, "blocked_sender");
      return;
    }

    try {
      await message.forward(aliasRecord.destination);
    } catch {
      return;
    }

    ctx.waitUntil(ingestMessage(message, aliasRecord, fromHeader, env));
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
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

    await fetch(env.INGEST_ENDPOINT, {
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
  } catch {
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

function extractEtld1(header: string): string | null {
  if (!header) {
    return null;
  }

  const emailMatch = /(?:[^\s<>@,;:"]+)@([^\s<>@,;:"]+)/.exec(header);
  if (!emailMatch) {
    return null;
  }

  let domain = emailMatch[1].toLowerCase();
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
