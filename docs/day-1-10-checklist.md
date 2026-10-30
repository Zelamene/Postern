# Postern — Day 1 to Day 10 checklist

Source: `Proposals/Postern Plans.pdf`, "THE POSTERN ROADMAP (v7 — 24 Days, Zero-Cost)", Days 1–10.
Verified against the working tree at commit `a1a323e` on 2026-10-30.

Legend:

- `[x]` implemented and covered by an automated test
- `[~]` implemented but only partially meets the plan, or untested
- `[ ]` not implemented
- `[?]` platform/manual verification that cannot be proven from the repository

---

## Day 1 — Repo, API skeleton, schema

- [x] Repo init and `docker-compose.yml` (db + api + web, non-root users, dropped capabilities).
- [x] .NET minimal API skeleton with `GET /health` that does not query the database
      (`backend/src/Postern.Api/Program.cs`; `Api/HealthEndpointTests.cs` proves it answers without a DB).
- [x] Schema and migrations for `users`, `aliases`, `messages`, `expected_senders`,
      `blocked_messages`, `invite_codes`, `admin_audit_log`, `global_blocklist`
      (`PosternDbContext.cs` + three migrations incl. initial schema, unique recovery-key index, forwarding address).
- [x] `aliases.full_address_hash` (unique) and `aliases.kv_dirty` present, with check constraints for
      tombstone shape, status enum, deleted-at presence (`Constraints/DatabaseConstraintTests.cs`).
- [x] `IKvWriter` and `IDestinationService` interfaces plus in-memory fakes that can be told to fail
      (`InMemoryKvWriter.ShouldFail`, `InMemoryDestinationService`), used by `AliasServiceKvFailureTests`.
- [x] KV contract documented and implemented on the worker side: per-alias key plus
      `__global_blocklist`, `suspended_users`, `rate_limited_users`, all read with `cacheTtl: 60`
      (`worker/src/index.ts`, `worker/README.md`).
- [x] Alias scheme matches the plan: `{label}.{random4}@{yourdomain}`. Domain and suffix length come from
      `Alias:Domain` / `Alias:SuffixLength` (`AliasPolicy`, suffix 4–8), the separator is `.`, and the
      defaults are validated at startup (`Program.cs`).
- [x] Per-alias KV `destination` is the owner's forwarding address, written through `AliasKvRecord` on
      create, disable, replace and forwarding-address change (`AliasService`, `AccountManagementService`,
      `AliasEndpointsTests`, `AccountManagementEndpointsTests`).

## Day 2 — Authentication

- [x] JWT cookie auth, `HttpOnly`, `SameSite=Strict`, `Secure` outside Development, 1-hour lifetime
      (`JwtTokenIssuer`, `Program.cs` JwtBearer setup, `AuthorizationTests`).
- [x] Invite cap checked at signup: `AuthenticationService.MaximumUsers = 199`.
- [x] Verification check at login: pending accounts activate only once the destination is verified;
      unverified login returns 403 (`Flows/AuthenticationEndpointsTests`).
- [x] Recovery key issued after verification, only its SHA-256 hash stored, rotated on every use,
      reused key rejected (`Flows/AuthenticationEndpointsTests`).
- [x] Recovery endpoint rate-limited (5 per 15 minutes) and tested.
- [x] EAI/IDN address handling (`EmailAddressNormalizer`, 392 lines, unit-tested).
- [~] Production Cloudflare destination adapter missing by design:
      `UnconfiguredDestinationService` throws, README documents that production signup must stay off.

## Day 3 — Local inbound path and tombstone

- [x] Local fake inbound path: `POST /api/ingest` accepts the worker payload (`IngestEndpoints`).
- [x] Alias model plus tombstone hash lookup (`AliasService.IsAddressHashTombstonedAsync`).
- [x] Alias creation checks tombstones: each generated address is hashed and skipped when tombstoned,
      retrying up to five times before giving up (`AliasService.CreateAsync`;
      `AliasServicePolicyTests.Create_RetriesWhenTheGeneratedAddressIsTombstoned`,
      `Create_ReturnsNullWhenEveryGeneratedAddressIsTombstoned`).

## Day 4 — Worker spike (GO / NO-GO)

- [x] Worker reads `from` header, `message.from`, `message.to`, `Authentication-Results`
      (`worker/src/index.ts`).
- [x] Worker reads the alias record and the three global KV keys with `cacheTtl: 60`.
- [x] Decision logic present for: alias missing → drop silently; suspended user → drop silently;
      rate-limited user → log blocked; disabled/replaced → log blocked; global blocklist → log blocked;
      per-alias blocked sender → log blocked; otherwise `message.forward()`.
- [x] `ctx.waitUntil()` POST to `/api/ingest`, best-effort with swallowed failures.
- [?] The eight platform verifications (To: header preserved, Authentication-Results readable,
      destination add/poll/remove via Cloudflare API, backend→KV→worker round trip, global blocklist
      read, `message.from` vs header difference, cold-Render POST survival, cron trigger firing)
      all need a live Cloudflare/Render environment. None can be asserted from this repo.
- [x] Worker/API blocked contract: `IngestRequest` carries `blocked` and `reason`, `IngestService`
      records a `BlockedMessage` with a normalized reason (default `blocked`, truncated to 32) and never
      falls through to the status rules (`IngestBlockedTests`, `Flows/IngestFlowTests`).
- [x] Forwarding has a real target now that KV `destination` is populated (see Day 1).

## Day 5 — Alias lifecycle

- [x] `POST /api/aliases`: server-generated suffix, reserved-label rejection, label trim/truncate,
      DB write plus KV write with `kv_dirty` fallback on failure.
- [x] `POST /api/aliases/{id}/mark-expected` and `POST /api/aliases/{id}/block-sender`.
- [x] eTLD+1 normalization applied to expected senders (`Etld1Normalizer`, unit + integration tested).
- [~] Plan places sender normalization in `POST /aliases`; it is implemented on the expected-sender
      endpoints instead, which is where the sender is actually supplied.
- [x] Reserved names: `admin`, `postmaster`, `abuse`, `noreply`, `support`, plus `root`,
      `hostmaster`, `webmaster` (`ReservedAliases`).

## Day 6 — Ingestion hardening and eTLD+1

- [x] `/api/ingest` checks `X-Postern-Ingest-Secret` when `Ingest:SharedSecret` is configured.
- [x] The secret is a declared setting (`Ingest:SharedSecret` in `appsettings.json`, `Ingest__SharedSecret`
      in `env/api.env.example`). Development may leave it empty; outside Development startup throws when it
      is missing (`Program.cs`), and `IngestFlowTests` proves the reject/accept paths.
- [x] From header normalized to eTLD+1, including `Name <addr>` form (fixed this cycle in
      `Etld1Normalizer`; `Etld1NormalizerTests`).
- [x] Five flag cases implemented and unit-tested: expected+pass, expected+none, unexpected+pass
      (`unexpected_pass`), unexpected+none (`unexpected_none`), auth fail (`fail`)
      (`IngestFlagLogicTests`, 282 lines).
- [x] Missing expected-sender case: first DMARC-passing sender is recorded as expected.
- [x] Rate-limit map rebuild is wired into `/api/ingest`: after an accepted message every user over the
      daily forwarding cap is published in `rate_limited_users` with a 24-hour expiry timestamp
      (`RateLimitService`, serialized by a semaphore; `RateLimitMapRebuildTests`, `Flows/IngestFlowTests`).

## Day 7 — Activity logging

- [x] RFC 2047 decoding before truncation (`Rfc2047Decoder`), subject truncated to 60 characters.
- [x] `GET /api/aliases/{id}/messages` and `GET /api/messages/blocked`
      (`ActivityEndpoints`, `ActivityService`).
- [x] Beyond plan: cursor pagination, newest-first ordering, 90-day retention window, 404 for foreign
      aliases, page-size clamping, scoped blocked log.
- [x] Integration coverage for ordering, full page walk, equal-timestamp ties, retention, scoping and
      malformed cursors (`Modules/ActivityEndpointsTests`, 14 tests).
- [x] Defect found and fixed while testing: the cursor compared `Guid.ToString("N")` against EF's
      `Guid.ToString()`, so the cursor row repeated on the next page (`EfActivityRepository`).

## Day 8 — Replace / deactivate / delete

- [x] `PATCH /api/aliases/{id}` for `disable` and `delete`, DB plus KV, unknown actions rejected.
- [x] `POST /api/aliases/{id}/replace`: creates the replacement, copies expected senders, marks the
      old alias `replaced` with `replaced_by_alias_id`, KV `kv_dirty` fallback.
- [x] `DELETE /api/aliases/{id}`: tombstone keeps `full_address_hash`, clears personal columns, deletes
      the KV entry.
- [x] Lifecycle transitions enforced (`AliasLifecycle`), including rejection of repeated disables.
- [x] Suspension is written end to end: `POST /api/admin/users/{id}/suspend` and `/resume` set the user
      status and republish `suspended_users`, so the worker's drop rule has real data
      (`AdministrationService`, `SuspendedUserService`, `AdministrationEndpointsTests`).

## Day 9 — Account management

- [x] `POST /api/users/change-forwarding-address`: removes the old destination, adds the new one,
      updates only `forwarding_address` (login identity untouched).
- [x] `DELETE /api/users/me`: deletes user, messages, expected senders and blocked messages; tombstones
      aliases preserving hashes; deletes KV entries; removes the destination.
- [x] Both covered end to end (`Modules/AccountManagementEndpointsTests`, `Infrastructure/AccountRepositoryTests`).
- [x] The new forwarding address is republished into every owned alias's KV `destination`
      (`AccountManagementService.RepublishAliasesAsync`, with `kv_dirty` fallback; covered by
      `AccountManagementEndpointsTests`).

## Day 10 — Buffer and tests

- [x] xUnit coverage for flag logic, tombstones, `kv_dirty`, rate-limit map rebuild
      (`IngestFlagLogicTests`, `IngestAndTombstoneTests`, `KvDirtyBehaviorTests`,
      `RateLimitMapRebuildTests`).
- [x] Reusable integration base: one disposable `postgres:18` Testcontainer per collection, API factory
      wired to it, signed JWT helper, seeding helpers (`Fixtures/`, `Collections/`).
- [x] Integration project restructured into `Api/ Constraints/ Flows/ Infrastructure/ Modules/ Workers/`,
      with a documented template (`backend/tests/Postern.IntegrationTests/README.md`).
- [x] Suites green: 175 unit + 108 integration = 283 tests.
- [x] Merged line coverage 89.8% excluding generated EF migrations.
- [x] Rate-limit map rebuild tests assert the per-user timestamp map, not the old empty map.
- [x] Admin surface pulled forward from Days 15–16: `POST /api/admin/users/{id}/suspend|resume`,
      `GET|POST /api/admin/global-blocklist`, `DELETE /api/admin/global-blocklist/{domain}`,
      `POST /api/admin/suspended-users/rebuild`, all admin-role gated and audit-logged
      (`AdministrationEndpoints`, `AdministrationService`, `GlobalBlocklistService`, 13 integration tests).
- [x] Global blocklist is written, not just read: every add/remove republishes `__global_blocklist`
      (`{ "domains": [...] }`), matching the worker's reader.

---

## Summary

| Day | Theme | Status |
| --- | --- | --- |
| 1 | Repo, API skeleton, schema, KV contract | Done — alias scheme configurable, KV `destination` populated |
| 2 | JWT auth, invites, verification, recovery keys | Done (production destination adapter outstanding by design) |
| 3 | `/api/ingest`, alias model, tombstones | Done — create-time tombstone guard with retry |
| 4 | Email worker spike | Built; ingest contract now carries `blocked`/`reason`; platform GO/NO-GO checks still manual |
| 5 | Alias lifecycle | Done |
| 6 | Ingestion hardening, eTLD+1, flag rules | Done — ingest secret configured and enforced, rate-limit rebuild wired |
| 7 | Activity logging | Done, with a pagination defect fixed |
| 8 | Replace / deactivate / delete | Done — suspension endpoint and map included |
| 9 | Account management | Done — KV destination follows forwarding changes |
| 10 | Tests and buffer | Done — 283 tests, 89.8% line coverage, admin surface added |

## Known gaps, in priority order

1. **Dashboard not started** — `web/src/App.tsx` is still the Day 1 health-check scaffold (Days 11–14).
2. **Production destination adapter missing** — documented, blocks production registration.
3. **Platform GO/NO-GO checks** — the eight worker verifications (Day 4) need a live Cloudflare/Render setup.

## Reproducing the verification

```
dotnet test backend/Postern.slnx
dotnet test backend/tests/Postern.IntegrationTests --collect:"XPlat Code Coverage"
```

Integration tests require Docker; they start and dispose their own PostgreSQL container.
