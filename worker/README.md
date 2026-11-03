# Postern Email Worker

Cloudflare Worker for processing inbound mail via Cloudflare Email Routing.

## Features

- Reads alias and global policy from Workers KV with 60s cache TTL
- Forwards allowed mail to destination using `message.forward()`
- Drops mail for disabled/replaced aliases or suspended users without bouncing
- Blocks mail from global blocklist or per-alias blocked senders
- Enforces rate limiting via `rate_limited_users` map
- Sends activity to backend via `ctx.waitUntil()` POST to `/api/ingest`
- Best-effort ingestion - mail forwarding works even if backend is cold/unavailable

## KV Contract

- Per-alias key: `{alias-address}` → `{ destination, status, userId, blockedSenders[] }`
- `__global_blocklist` → `{ domains: string[] }`
- `suspended_users` → `{ users: { [userId]: true } }`
- `rate_limited_users` → `{ users: { [userId]: unixTimestamp } }`
