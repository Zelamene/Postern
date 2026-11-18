# Phase 6 load rig

Executable harnesses for the NFR latency and capacity rows. All scripts run
against a local Docker Compose stack by default; none of them hit production.

## Prerequisites

```powershell
docker compose up -d --build --wait
dotnet tool restore
# Migration connection string must point at the local DB (see web/scripts/run-e2e.mjs).
$db = Get-Content env/db.env | ConvertFrom-StringData
$env:POSTERN_MIGRATOR_CONNECTION_STRING = "Host=127.0.0.1;Port=5432;Database=$($db.POSTGRES_DB);Username=$($db.POSTERN_MIGRATOR_ROLE);Password=$($db.POSTERN_MIGRATOR_PASSWORD);Search Path=postern"
dotnet ef database update --project backend/src/Postern.Infrastructure --startup-project backend/src/Postern.Api

node load/scripts/seed.mjs           # 199 deterministic accounts + aliases
node load/scripts/seed-messages.mjs  # full 50-item activity and blocked pages
```

`seed.mjs` creates one throwaway account through the dev endpoints to obtain a
real password hash, then writes the deterministic dataset straight to PostgreSQL.
This avoids the 10-logins-per-15-min dev rate limit. Generated files under
`load/scripts/generated/` are gitignored.

## Scenarios

k6 2.4.0 is required. Set the secrets from `env/api.env` before each run:

```powershell
$api = Get-Content env/api.env | ConvertFrom-StringData
$env:POSTERN_INGEST_SECRET = $api.Ingest__SharedSecret
$env:POSTERN_SIGNING_KEY   = $api.Authentication__SigningKey
```

| Script | Row | What it does |
| --- | --- | --- |
| `scripts/k6-ingest.js` | QR2.1 | 20 rps constant-arrival ingest for 5 min, unique `Message-ID` per request; p95 ≤ 300 ms, 0 5xx / 404 |
| `scripts/k6-read.js` | QR2.2 | 25 rps authenticated reads over 50-item activity and blocked pages; p95 ≤ 500 ms each |
| `scripts/k6-mixed.js` | QR3.3 | `POSTERN_PROFILE=mixed\|peak\|saturation`; 20+25 rps, 28+25 rps peak, and 100 rps login flood asserting 429-not-5xx with ingest still healthy |
| `scripts/time-to-effect.mjs` | QR2.3 | Node/Miniflare publish-then-poll over 200 cycles; p95 ≤ 60 s plus a source check of the four `cacheTtl:60` mail reads |

Example full run with evidence export:

```powershell
$env:RUN_ID = 'qr21-full'; $env:POSTERN_DURATION = '5m'
k6 run --summary-export qr2.1-summary.json load/scripts/k6-ingest.js
```

`POSTERN_DURATION`, `POSTERN_RATE`, `POSTERN_READ_RATE`, `POSTERN_PROFILE` and the
`POSTERN_TTE_*` variables override the defaults. Do not use `K6_DURATION` or
`K6_RATE`: k6 reserves those names and they silently override scenario config.

## Caveats

- Results are from the local Development stack, not production.
- Read and mixed scenarios mint HS256 JWTs locally (issuer `Postern`, audience
  `Postern.Web`) from the real signing key; they never call the rate-limited
  login endpoint.
- Miniflare does not emulate KV `cacheTtl` staleness. The time-to-effect number
  is the propagation floor; the 60 s bound rests on the verified TTL in
  `worker/src/index.ts`.
- The saturation 429 comes from the ASP.NET IP rate limiter on login. The
  Cloudflare Worker forwarding path is independent and covered by QR4.1.
- Curated results and raw summaries live in `docs/nfr/evidence/`.
