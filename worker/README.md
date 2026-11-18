# Postern Email Worker

Cloudflare Worker for processing inbound mail via Cloudflare Email Routing.

## Features

- Reads alias and global policy from Workers KV with 60s cache TTL
- Forwards allowed mail to destination using `message.forward()`
- Drops mail for disabled/replaced aliases or suspended users without bouncing
- Blocks mail from global blocklist or per-alias blocked senders
- Enforces rate limiting via `rate_limited_users` map
- Sends activity, including the normalized `Message-ID`, to backend via `ctx.waitUntil()` POST to `/api/ingest`
- Best-effort ingestion - mail forwarding works even if backend is cold/unavailable
- Per-message outcome counters (`forwarded` / `dropped` / `errored`) in Workers Analytics Engine

## Mail-path outcomes (QR4.3)

Every mail decision writes one Analytics Engine data point to the `postern_outcomes`
dataset. `index1` is the outcome, `blob1` is the drop reason (empty otherwise), and
`double1` is 1. Analytics Engine is used instead of KV because the mail path must not
add a KV write. The binding is optional so local tests and older deployments keep
working without it; a failed counter write never changes a mail decision.

The `0 4 1 * *` cron queries the previous UTC month through the Cloudflare Analytics
Engine SQL API and stores one summary record at the `mail_path_last_month` KV key.
That is a single KV write per month, outside the per-message budget. Configure
`CF_ACCOUNT_ID` and `CF_API_TOKEN` (Account > Account Analytics > Read) as Worker
secrets; without them the aggregation is skipped and logged. In production these are
written to the Worker by the `deploy-worker` job in `.github/workflows/cd.yml`, from the
GitHub secrets `CF_ANALYTICS_ACCOUNT_ID` and `CF_ANALYTICS_API_TOKEN`. The recorded
figure is `forwarded / (forwarded + errored)` — intentional drops are not unavailability.

## KV Contract

- Per-alias key: `{alias-address}` → `{ destination, status, userId, blockedSenders[] }`
- `__global_blocklist` → `{ domains: string[] }`
- `suspended_users` → `{ users: { [userId]: true } }`
- `rate_limited_users` → `{ users: { [userId]: unixTimestamp } }`
- `mail_path_last_month` → monthly outcome summary written by the Worker, not read by the mail path

## Ingest payload

The worker posts `recipientAddress`, `envelopeSender`, `fromHeader`, `subject`,
`authenticationResult`, and the RFC 5322 `Message-ID` (when present). Blocked decisions also send
`blocked: true` and a `reason`. The API uses the Message-ID to deduplicate repeated deliveries per
alias.

## Testing

```sh
npm test
npm run typecheck
```

The Vitest suite uses in-memory KV and fetch fakes, so it runs without Wrangler or a Cloudflare
account.
