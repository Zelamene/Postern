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
| QR7.2 | 0 new high/critical issues; duplication ≤ 3%; cognitive complexity ≤ 15 per function | `evidence/QR7.2-2026-11-18.json` (CI SonarCloud gate, main branch, 18 Nov 2026); `.github/workflows/sonarcloud.yml` | Gate PASSED: 0 new issues, 0.0% duplication, 0 open S3776; 90.0% new-code coverage |

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
| QR1.6 | Runtime dependency advisories (web, worker, NuGet) | `nfr-ci.yml` `dependency-audit` job; `web-ci.yml` `build-and-test` job |
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

Mail for an unknown recipient is still dropped without a blocked row. That is an
anti-abuse decision, not a missing test: the alias is unknown, so there is no owner to
charge the write to, and `blocked_messages.aliases` requires a real alias. The rule
is documented at the drop site in `worker/src/index.ts`.

