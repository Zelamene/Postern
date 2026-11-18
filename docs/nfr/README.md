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
| QR1.6 | Runtime dependency advisories (web, worker, NuGet) | `nfr-ci.yml` `dependency-audit` job |
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

`shared/critical-paths.json`, `shared/blocked-reasons.json` and `shared/kv-records.json`
are cross-runtime contracts, in the same spirit as `shared/etld1-cases.json`: the Worker
suite and the API suite read the same file, so the two runtimes cannot drift apart
without a build failure.

## Decisions recorded with the evidence

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

Mail for an unknown recipient is still dropped without a blocked row. That is an
anti-abuse decision, not a missing test: the alias is unknown, so there is no owner to
charge the write to, and `blocked_messages.aliases` requires a real alias. The rule
is documented at the drop site in `worker/src/index.ts`.

