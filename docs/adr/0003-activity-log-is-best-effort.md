# ADR 0003: Forward first, log second; activity logging is best effort

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

After deciding what to do with a message, the Worker tells the API about it so the user can see it in
their activity list. That call can fail: the API may be deploying, cold, rate limited, or simply
unreachable.

Postern has to choose which of the two promises is stronger: "mail is delivered" or "mail is
recorded".

## Decision

Delivery wins.

- The Worker forwards (or drops) the message based on its own data, then reports the result with
  `ctx.waitUntil()` after the mail decision is already made.
- If the report fails, the failure is logged and the request is not retried from a queue. The
  activity row for that message does not exist.
- The Worker never waits for the API before forwarding.

## Alternatives considered

- **Cloudflare Queues (or a Durable Object) between the Worker and the API.** This is the honest
  alternative: it would give retries and a dead-letter path. Rejected at the time for the extra
  moving parts and the extra cost, not because it would not work.
- **Blocking the forward until ingest succeeds.** Rejected: a slow or broken API would then stop
  mail, which is worse than a missing log line.
- **Rebuilding the activity list from Analytics Engine counters.** Rejected. The counters are
  aggregate and sampled; they cannot answer "which address, from whom, when".

## Consequences

Mail keeps arriving during API problems, which is the behaviour the product promises first.

**Least comfortable:** the activity list is not a complete record. It has a hole exactly the size of
each API outage, and the system cannot say afterwards which messages fell into it. This sits badly
next to the word "auditable" in the project description. It is a real limit, not a bug, and it is
written down here so that nobody discovers it during an incident and assumes the data is complete.
