# NFR evidence

One JSON file per closed NFR row, named `<ID>-<yyyy-mm-dd>.json`. The file is the
record; the matrix row points at it.

Rules this directory follows, learned the hard way on QR2.4:

- **Measure where the number lives.** A budget that the runtime enforces (Worker
  CPU, KV operation counts) must be evidenced by the runtime or by a deterministic
  harness over it, never by a proxy on another runtime.
- **Record the sample size, the window, and the environment.** A quantile without
  `n` is not evidence. When every bucket holds one sample, say P99 is a maximum.
- **Record what was excluded.** Cron ticks, background jobs and maintenance paths
  share the script name; a mail-path figure must not include them.
- **State the caveats the number does not cover.** `cpuTime` excludes I/O wait, so
  a CPU pass says nothing about KV or database latency.
- **Tie the figure to the configuration.** A `compatibility_date` or workerd bump
  invalidates it; the file names the version it was taken on.

## Closed

| Row | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| QR2.4 | <= 10 ms Worker CPU per message at worst-bucket P99; <= 4 KV reads; 0 KV writes per message | `evidence/QR2.4-2026-11-17.json` (Cloudflare `workersInvocationsAdaptive.cpuTimeP99`, production burst, n=30); `worker/test/kv-budget.test.ts` (reads/writes gate) | 2.725 ms P99 (= max at n=30) vs 10 ms; 4 reads / 0 writes |
| QR1.6 | 0 high dependency advisories; 0 high DAST findings; no medium unresolved > 30 days | `evidence/QR1.6-2026-11-18.json` (runtime SCA gates + seeded ZAP full scans); `web/scripts/run-dast.mjs`, `web/scripts/review-dast-findings.mjs`, `.github/workflows/browser-nightly.yml` | PASS: 0 high advisories, 0 high DAST findings, 0 unexcluded medium findings, 0 medium findings past the 30-day review |
| QR7.2 | 0 new high/critical issues; duplication ≤ 3%; cognitive complexity ≤ 15 per function | `evidence/QR7.2-2026-11-18.json` (CI SonarCloud gate, main branch, 18 Nov 2026); `.github/workflows/sonarcloud.yml` | Gate PASSED: 0 new issues, 0.0% duplication, 0 open S3776; 90.0% new-code coverage |
| QR2.1 | Ingest p95 ≤ 300 ms at 20 rps for 5 min; 0 unexpected 5xx | `evidence/QR2.1-2026-11-18.json` + raw k6 summary; `load/scripts/k6-ingest.js`, `load/scripts/seed.mjs` | PASS: 23.756 ms p95 at 20.002 rps over 5 min (n=6001), 0 unexpected 5xx |
| QR2.2 | Dashboard reads p95 ≤ 500 ms on 50-item pages | `evidence/QR2.2-2026-11-18.json` + raw k6 summary; `load/scripts/k6-read.js`, `load/scripts/seed-messages.mjs` | PASS: 13.401 ms activity / 12.019 ms blocked p95 (n=7501), every page 50 items |
| QR2.3 | Core-task steps p95 ≤ 2 s; task p95 ≤ 5 s; effect in mail path p95 ≤ 60 s | `evidence/QR2.3-2026-11-18.json` (mail-effect leg only); `load/scripts/time-to-effect.mjs` | Mail-effect leg PASS: 23.982 ms p95 floor (n=200), 4× `cacheTtl:60` reads verified; 2 s / 5 s journey timings remain `(build)` |
| QR3.3 | ≥ 95% of core-task steps meet targets under 20 rps ingest + 25 sessions; < 1% errors; same at 28 rps peak; excess throttled, mail unaffected | `evidence/QR3.3-2026-11-18.json` + three raw k6 summaries; `load/scripts/k6-mixed.js` | PASS: 100% steps in target and 0% errors at 20 rps and 28 rps peak; 6001× 429, 0× 5xx under saturation with mail ingress 100% healthy |
| QR3.2 | < 1,000 KV writes per day at 199 accounts; ≤ 1 write per alias change | `evidence/QR3.2-2026-11-18.json` (instrumented `IKvWriter` + advancing `TimeProvider` 24 h simulation and Cloudflare dashboard billed counts); `backend/tests/Postern.UnitTests/KvWriteBudgetSimulationTests.cs` | PASS: 226 writes in 24 h (427 incl. initial projection), 1 per alias change; dashboard Nov-to-date 63 mutating ops (18 writes + 45 deletes), 240 in all op classes |
| QR4.2 | First request after idle p95 ≤ 30 s; waking state displayed | `evidence/QR4.2-2026-11-18.json` (delayed-response Playwright test); `web/test/e2e/user/waking-state.spec.ts`, `.github/workflows/browser-nightly.yml` | PASS (in-repo waking-state half): waking message asserted in 5/5 fresh-stack runs with a 6 s delayed response; cold-start p95 sample remains external |
| QR6.1 | 0 serious/critical violations; WCAG 2.1 AA; keyboard-only operation of all actions | `evidence/QR6.1-2026-11-18.json` (axe scans + keyboard journey); `web/test/e2e/support/a11y.ts`, `web/test/e2e/user/accessibility.spec.ts`, `web/test/e2e/admin/accessibility.spec.ts`, `.github/workflows/browser-nightly.yml` | PASS: 0 violations across public light/dark, signed-in user and signed-in admin; keyboard alias journey passed 5/5 runs |
| QR6.2 | Median core-task completion ≤ 2 min; 100% of journeys pass on a fresh database | `evidence/QR6.2-2026-11-18.json` (Playwright wall-clock timing over 5 fresh-stack runs); `web/test/e2e/support/timing.ts`, `.github/workflows/browser-nightly.yml` | PASS: medians 1,323 ms create alias / 2,064 ms review activity / 588 ms sync KV; 28/28 journeys passed in 5/5 runs |
| QR6.3 | 100% of stale-data surfaces state the propagation delay and best-effort logging | `evidence/QR6.3-2026-11-18.json` (Playwright copy assertions); `web/src/components/common/StaleDataNotice.tsx`, `web/test/e2e/user/data-freshness.spec.ts`, `web/test/e2e/admin/accessibility.spec.ts` | PASS: both statements asserted on every user and admin stale-data surface in 5/5 runs |

Reproduce the CPU figure with `./collect-qr2.4.ps1 -From <start> -To <end>` (needs
a token with **Account Analytics: Read**). The script refuses to write evidence if
the request count, error count or invocation statuses do not line up, so a routing
failure cannot be recorded as a CPU pass.

`worker/perf/cpu-budget.test.ts` is a Node-side regression canary. It reports totals
only: at 10,000 messages the per-batch CPU cost is often below the clock's resolution,
so per-batch quantiles are meaningless. It is not, and must not be presented as, QR2.4
evidence.

## Test-backed gates

Rows closed by an executable check rather than a measurement record. The test or job
named here fails the pipeline; it is the evidence.

| Row | Guard | Where |
| --- | --- | --- |
| QR7.1 | Coverage thresholds (worker, web merged, backend line) plus the five named critical paths | `worker/vitest.config.ts`, `web/vitest.coverage.config.ts`, `backend-ci.yml` (85% merged line coverage), `shared/critical-paths.json`, `Postern.IntegrationTests/CriticalPathInventoryTests.cs` |
| QR1.6 | Runtime dependency advisories (web, worker, NuGet); nightly authenticated ZAP full scan and 30-day medium review | `nfr-ci.yml` `dependency-audit` job; `web-ci.yml` `build-and-test` job; `browser-nightly.yml` `dast` job; `web/scripts/run-dast.mjs`, `web/scripts/review-dast-findings.mjs` |
| QR1.1 | Every `/api/admin` route rejects anonymous and non-admin callers, and is either documented in OpenAPI or explicitly exempt | `Postern.IntegrationTests/Api/AdminRouteInventoryTests.cs` |
| QR5.3 | Rate-limit projection refreshes at least every five minutes and survives a failed refresh | `Postern.IntegrationTests/Workers/RateLimitProjectionWorkerTests.cs` |
| QR1.5 | Boundary + 1 for every throttle policy, an inventory of anonymous credential endpoints, and exactly one trusted proxy hop | `Postern.IntegrationTests/Api/RateLimitPolicyTests.cs` |
| QR4.1 | Policy-permitted mail is forwarded even when the management API fails: network error, 5xx, and never-answering ingest all still forward; the failed ingest is logged | `worker/test/api-unavailable.test.ts` |
| QR3.1 | The 500/day cap is inclusive at 500 and exclusive at 501 | `Postern.UnitTests/RateLimitMapRebuildTests.cs`, `IngestFlowTests.Ingest_WhenUserExceedsDailyCap_LeavesTheProjectionToTheRefresher` |
| QR5.4 | Concurrent duplicate `Message-ID`s record exactly one row | `IngestFlowTests.Ingest_WithConcurrentDuplicateMessageIds_RecordsExactlyOneDelivery` |
| QR5.5 | Every reason the Worker can write reaches a blocked row, from one shared list | `shared/blocked-reasons.json`, `worker/test/index.test.ts`, `Postern.UnitTests/IngestBlockedTests.cs` |
| QR7.3 | The KV record contract is shared by the API serializers and the Worker reader, including all three map writers | `shared/kv-records.json`, `Postern.UnitTests/KvRecordContractTests.cs`, `Postern.UnitTests/GlobalBlocklistServiceTests.cs`, `Postern.UnitTests/SuspendedUserServiceTests.cs`, `Postern.UnitTests/RateLimitMapRebuildTests.cs`, `worker/test/kv-contract.test.ts` |
| QR1.4 | Mail tables carry no body column, subject is `varchar(60)` with named check constraints, and the suite runs the real migrations | `Postern.IntegrationTests/Database/DatabaseSchemaTests.cs`, `Fixtures/PosternFixture.cs` |
| QR5.2 | An empty namespace rebuilds all four projections, a full sync deletes orphan keys, and a second sync rewrites no alias key | `Postern.IntegrationTests/Flows/ProjectionRebuildTests.cs` |
| QR1.2 | A protected value stays readable by a second host with only the database configured | `Postern.IntegrationTests/Database/DataProtectionRestartTests.cs` |
| QR1.3 | Every administrative route declares its audit events and all ten mutating routes are asserted to emit exactly those events; approve emits three, the log rejects UPDATE and DELETE, and account deletion is refused while an account is named on audit rows | `shared/admin-audit-events.json`, `Postern.IntegrationTests/Api/AdminAuditTests.cs`, migration `ProtectAdminAuditLog`, `database/init/10-postern-roles.sql` |
| QR4.3 | Per-message `forwarded` / `dropped` / `errored` outcomes feed a monthly mail-path figure, and the first monitor and heartbeat windows are recorded | `worker/src/index.ts` (`OUTCOMES`, `aggregatePreviousMonth`), `worker/test/outcomes.test.ts`, `docs/nfr/evidence/QR4.3-2026-11-18.json`, `docs/nfr/evidence/QR4.4-2026-11-18.json` |
| QR7.2 | CI-based SonarCloud analysis imports backend Cobertura and both LCOV reports, waits for the quality gate, and fails the pipeline on a gate failure | `.github/workflows/sonarcloud.yml`, `.github/workflows/pipeline.yml`, `.github/workflows/nfr-ci.yml` (`worker-coverage` artifact) |

`shared/critical-paths.json`, `shared/blocked-reasons.json` and `shared/kv-records.json`
are cross-runtime contracts, in the same spirit as `shared/etld1-cases.json`: the Worker
suite and the API suite read the same file, so the two runtimes cannot drift apart
without a build failure.

## Decisions recorded with the evidence

- **QR1.6 SCA audit is runtime-scoped.** Both web gates use
  `npm audit --omit=dev --audit-level=high`, matching the worker and NuGet gates. The
  remaining `picomatch` advisory is confined to the dev build toolchain; upstream has no
  patched release, and the available forced downgrade replaces it with high and critical
  Vite/Vitest advisories. The runtime dependency audit reports 0 high advisories.
- **QR1.6 DAST uses the real seeded E2E sessions.** The nightly `dast` job starts the
  disposable compose stack, serves the built app through Vite preview, seeds a signed-in
  user and an MFA-completed admin through the same helpers as the browser journeys, and
  replays their `Postern.Auth` cookies into two ZAP `zap-full-scan.py` runs. The admin
  scan runs first under a 15-minute role timeout because its JWT is deliberately limited
  to 15 minutes; scans start with `-silent` so the pinned image's add-ons cannot update
  mid-run. Reports are uploaded as `qr1.6-zap-reports`.
- **QR1.6 medium findings are tracked by age, not suppressed.** The review script
  creates one GitHub issue per stable finding fingerprint, refreshes its last-seen
  date each night, closes issues no longer observed, and fails the nightly workflow
  when a high finding appears or a medium issue remains open for more than 30 days.
  Rule `10106` (`HTTP Only Site`) is the one documented exclusion: the target is a
  disposable HTTP-only stack and TLS is reviewed per environment, so that rule is
  not treated as a product finding.
- **QR1.3 counts audit events, not mutations.** Approving an invite request writes
  `invite_request.approved`, `invite.created` and `invite.approved` in one transaction.
  The requirement is enforced as "each route emits exactly its declared events", with the
  declaration in `shared/admin-audit-events.json`; an endpoint with no declaration fails
  the route-inventory test. The `suspended-users/rebuild` endpoint previously wrote no
  audit row and now writes `suspended_users.rebuild` with the projected count.
- **Immutability is enforced by a trigger, not only by grants.** The application role is
  granted DML on all tables and receives the same grant for future tables through
  `ALTER DEFAULT PRIVILEGES`; a REVOKE alone is one migration away from being undone. The
  `ProtectAdminAuditLog` migration also drops the `admin_user_id` foreign key so no cascade
  can erase attribution, and account deletion returns `409` when the account is named on
  audit rows.
- **QR1.2 covers restart persistence, not encryption at rest.** The Data Protection key XML
  is stored unencrypted in `postern.data_protection_keys`. Anyone with database read access
  can therefore recover protected invite codes, which are single-use and short-lived, but
  the row's "0 secrets at rest" intent is not met. `ProtectKeysWithCertificate` is the
  missing half and is deliberately tracked as a separate decision, not claimed here.
- **QR4.3 availability excludes intentional drops.** The monthly figure is
  `forwarded / (forwarded + errored)`. Policy blocks and unroutable recipients are
  `dropped` outcomes, not unavailability; writes to blocked rows remain deliberately
  absent for unknown recipients. Unknown-recipient drops still emit an aggregate
  counter with no address, so the anti-abuse decision is preserved.
- **QR4.3 counters add no KV writes.** Analytics Engine carries the per-message data,
  so QR2.4's 4 reads / 0 writes and QR3.2's <1,000 writes/day are unchanged. The
  monthly aggregation writes one `mail_path_last_month` record, outside the per-message
  budget. The query uses `SUM(_sample_interval)` so Analytics Engine sampling does not
  undercount.
- **QR4.3 / QR4.4 clocks are recorded, not yet readable.** The readiness monitors and
  heartbeat have measured since 17 Nov 2026; mail-path counters start when this Worker
  bundle is deployed. No percentage is claimed until a full window closes. See
  `QR4.3-2026-11-18.json` and `QR4.4-2026-11-18.json`.
- **QR4.3 runtime secrets are provisioned by CD, not stored here.** The `deploy-worker`
  job in `cd.yml` pipes two GitHub secrets into `wrangler secret put` before `wrangler
  deploy`: the analytics account ID and `CF_ANALYTICS_API_TOKEN` (a dedicated Cloudflare
  token with Account > Account Analytics > Read). The account ID is taken from
  `CF_ANALYTICS_ACCOUNT_ID` when set, otherwise from `CLOUDFLARE_ACCOUNT_ID`, because
  Analytics Engine lives in the deploy account. The job fails if the ID or the token
  is unset, so the deployed Worker cannot silently lose its monthly aggregation. Do
  not reuse the deploy token unless it also has that permission.
- **QR2.4 evidence predates the outcomes binding.** `QR2.4-2026-11-17.json` was taken on
  the Worker bundle without Analytics Engine writes. Deploying this bundle changes it;
  re-run the production burst and record a fresh evidence file. The Node CPU canary is
  not a substitute for Cloudflare `workersInvocationsAdaptive.cpuTimeP99`.
- **QR7.2 uses CI-based analysis, not automatic analysis.** Automatic analysis cannot
  import coverage and cannot run alongside a CI scan. `sonarcloud.yml` uses the
  SonarScanner for .NET because C# analysis requires it; the scanner does not read
  `sonar-project.properties`, so analysis properties are passed in the workflow. The
  scanner imports `artifacts/coverage/Cobertura.xml`, `web/coverage/lcov.info` and
  `worker/coverage/lcov.info`, and sets `sonar.qualitygate.wait=true`.
- **QR7.2 source identifiers are configurable.** The workflow defaults the project key
  to `${GITHUB_REPOSITORY//\//_}` and the organization to the lower-cased repository
  owner. If SonarCloud shows different keys, set repository variables
  `SONAR_PROJECT_KEY` and `SONAR_ORGANIZATION`; no workflow edit is needed.
- **QR7.2 keeps tracked code in scope.** `sonar.exclusions` only removes build output,
  dependencies and downloaded coverage artifacts: `bin`, `obj`, `node_modules`,
  `coverage`, `artifacts`, `dist`, `.sonarqube`. Migrations, `database/init`, `shared`,
  `docs`, `scripts`, tests and workflows remain tracked and analyzed. EF-generated
  migration files are excluded from **duplication only** via `sonar.cpd.exclusions`,
  because their repeated scaffolding would otherwise dominate the ≤3% gate; issues and
  complexity in hand-written migrations are still checked. E2E support modules, repo
  scripts, `playwright.config.ts` and `docs/nfr/**` are excluded from **coverage
  measurement only** via `sonar.coverage.exclusions`: Sonar indexes them as source, but
  no coverage report covers them, so their 299 new lines had dragged new-code coverage
  to 75.4%. They remain analyzed for issues and duplication, and the 80% threshold is
  unchanged.
- **QR7.2 gate conditions live in SonarCloud.** The workflow cannot create them. New Code
  must have "New high/critical issues = 0", "Duplication ≤ 3%", and rule `S3776`
  (Cognitive Complexity) active at threshold 15. The 18 Nov 2026 main-branch scan passed
  all six configured conditions, so the matrix QR7.2 row is `(exists)` and the recorded
  values are in `evidence/QR7.2-2026-11-18.json`. The workflow reports the conditions and
  open `S3776` issues in the CI log after every scan.
- **Phase 6 load rig measures the local compose stack, not production.** All four harnesses
  were run on 18 Nov 2026 against `http://127.0.0.1:8080` in Development. The 199-account
  dataset is deterministic (`load/scripts/nfr-dataset.mjs`); `seed.mjs` writes it to
  PostgreSQL because the dev login endpoint is capped at 10 per 15 min per source IP, and
  `seed-messages.mjs` tops every alias up to full 50-item activity and blocked pages. Raw
  k6 summaries sit beside each curated JSON file.
- **Read and mixed scenarios mint JWTs locally instead of logging in.** `k6-read.js` and
  `k6-mixed.js` build HS256 tokens in the `Postern.Auth` cookie with issuer `Postern`,
  audience `Postern.Web`, the `sub`/`email`/`jti` claims and the real signing key from
  `env/api.env`. No login call is made by those scenarios.
- **Miniflare does not emulate KV `cacheTtl` staleness.** The `time-to-effect.mjs`
  publish-then-poll harness measures only the propagation floor (23.982 ms p95); the 60 s
  production bound comes from the four `cacheTtl:60` reads in `worker/src/index.ts`, which
  the harness verifies in source. It is not claimed as an emulated edge-cache measurement.
  The 2 s step and 5 s task legs of QR2.3 still need server-timing-instrumented Playwright
  journeys.
- **QR3.3 saturation asserts 429-not-5xx on the rate-limited auth path.** The ASP.NET
  fixed-window IP limiter rejects the 11th+ login inside 15 minutes with 429; the harness
  floods that endpoint at 100 rps and confirms 0 5xx while ingest (the API-side mail
  ingress) continues at 20 rps with 100% 202/200. The Cloudflare Worker's forwarding
  decision path is independent of the API and is evidenced separately by QR4.1.
- **QR3.2 counts mutating API operations, not net state changes.** The instrumented
  `IKvWriter` counts every `PutAsync` and `DeleteAsync`, including deletes of absent
  keys, because Cloudflare bills the API call. The Worker mail path performs 0 KV
  writes (QR2.4), so the daily budget is owned by the API-side writers exercised by
  the simulation. Production still uses `CloudflareKvWriter`; the instrumentation and
  advancing clock exist only in the test.
- **QR3.2 includes the one-off initial projection in the stricter total.** The full
  sync of an empty namespace writes 201 alias and map keys; it is reported separately
  and also added to the 226 writes of the simulated day to give 427/day, still below
  1,000. Steady-state operation has no recurring projection cost.
- **QR3.2 dashboard cross-check uses billed operations, not GraphQL analytics.** The
  first manual check reads the `postern-kv` namespace Metrics page on 18 Nov 2026:
  18 writes + 45 deletes = 63 mutating operations, plus 169 reads and 8 lists = 240
  in all operation classes. The window is the November billing month to date, not a
  completed 30-day invoice, so this corroborates the simulation rather than supplying
  an independent 24 h measurement. GraphQL analytics is not the authoritative billing
  measure.

- **Phase 8 browser checks run nightly, not as PR gates.** `.github/workflows/browser-nightly.yml`
  runs five fresh-stack `npm run test:e2e` passes on a cron and via manual dispatch, uploading
  the QR6.2 timing sample as an artifact. The QR6.1 axe scans, keyboard-only journey, QR6.2
  timing assertions, QR6.3 copy assertions and QR4.2 waking-state check all run through
  `web/scripts/run-e2e.mjs`, which allocates a disposable PostgreSQL 17 volume and applies EF
  migrations before Playwright. None are wired into `web-ci.yml`, so they stay `[nightly]`.
  The runner forwards `POSTERN_E2E_TIMING_OUT` / `POSTERN_E2E_TIMING_RUN` to the specs; actions
  are pinned to commit SHAs like the other workflows.
- **QR6.2 timing is browser wall-clock, not server timing.** The backend emits no
  `Server-Timing` header, so the three timed core tasks (create alias, review activity,
  sync KV) are measured with `Date.now()` around the Playwright actions. This closes the
  "median task" and "100% pass on a fresh database" halves of QR6.2 but does not supply the
  2 s step / 5 s task server-timing legs of QR2.3, which remain `(build)`.
- **QR6.1 keyboard coverage is the core journey; QR6.3 checks copy presence.** The automated
  keyboard check covers alias creation only, so the "all actions" clause still relies on the
  per-release manual keyboard checklist. The QR6.3 assertions prove both statements render on
  every stale-data surface (one shared `StaleDataNotice` in each page shell) but not that the
  wording stays accurate per release, which the manual copy review covers.
- **QR4.2 closes only the waking-state half.** `web/test/e2e/user/waking-state.spec.ts` delays
  `/api/auth/me` by 6 s and asserts the `SLOW_AFTER_MS = 3000` UI state renders before the
  response completes. The ≤ 30 s cold-start p95 remains an external Better Stack sample with
  no in-repo collector; the status check records status codes only, so it cannot assert copy.
- **Fresh-volume E2E init guards the audit-log REVOKE.** `database/init/10-postern-roles.sql`
  runs before EF migrations create `postern.admin_audit_log`, so the REVOKE is conditional on
  `to_regclass('postern.admin_audit_log')`. The append-only trigger in migration
  `20261118001615_ProtectAdminAuditLog` is the authoritative immutability guard, so skipping
  the pre-migration REVOKE does not weaken QR1.3; the REVOKE still applies when roles are
  re-initialized after migrations.

Mail for an unknown recipient is still dropped without a blocked row. That is an
anti-abuse decision, not a missing test: the alias is unknown, so there is no owner to
charge the write to, and `blocked_messages.aliases` requires a real alias. The rule
is documented at the drop site in `worker/src/index.ts`.

