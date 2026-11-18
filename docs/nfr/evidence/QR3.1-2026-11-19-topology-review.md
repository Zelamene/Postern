# QR3.1 topology review record

- **Requirement:** QR3.1 — 199 accounts; 500 forwarded messages per account per 24 h; one API instance
- **Release / deployment:** repository snapshot reviewed from `origin/main` (no deployed topology access)
- **Environment:** pending operator confirmation
- **Reviewed on (UTC):** 2026-11-19
- **Reviewed by:** automated code/config/test review (agent-assisted)

## Checklist

- [x] **Account ceiling:** source-of-truth constant and gate tests support the 199-account limit as intended (repo-verifiable).
- [x] **Forwarding cap:** 500 forwarded messages per account per 24 h is defined/enforced in code and covered by existing gate tests (repo-verifiable; deployed edge/API behavior relies on release deployment).
- [ ] **API instance count:** exactly one API instance is deployed/active for this environment (or topology otherwise matches the documented single-instance assumption). **Operator verification pending.**
- [ ] Deployed configuration matches reviewed manifests/settings (worker, API, database, KV bindings). **Operator verification pending.**
- [ ] No topology change in this release invalidates prior QR3.1 assumptions; if changed, impact assessed. **Operator verification pending.**

## Evidence

- **Deployment topology/source reviewed:** repository code/tests/config only; no production/staging dashboard, IaC, or runtime instance inventory available in this review.
- **Account/cap configuration evidence:**
  - `backend/src/Postern.Application/Accounts/AuthenticationService.cs`: `public const int MaximumUsers = 199;`
  - `backend/tests/Postern.IntegrationTests/Api/CapacityEnvelopeTests.cs`: asserts `AuthenticationService.MaximumUsers == 199`, `RateLimitService.DailyForwardingLimit == 500`, and `RateLimitProjectionWorker.RefreshInterval <= 5 minutes` and worker registration.
  - Existing QR3.1 gate tests referenced by `docs/nfr/README.md`/matrix (edge-cap/signup/daily-limit/inclusive-exclusive boundaries).
- **Instance count evidence:**
  - Pending — single-instance deployment count must be verified from the actual environment (hosting control plane/manifests/runtime).
- **Related commits/config:** reviewed against `origin/main` snapshot on 2026-11-19.

## Result

- **Status:** PARTIAL — repo-verifiable limits/guards evidenced; **per-release deployed topology and single-API-instance verification pending** (cannot be recorded as PASS without environment inspection)
- **Summary:**
  - Code and automated tests establish the 199-account ceiling and 500/day forwarding cap intent/constants.
  - Single-instance topology and deployed configuration parity are operational concerns not verifiable from the repository alone.
- **Follow-ups (if any):**
  - Record deployed instance count and configuration parity per environment/release (dashboard/IaC/wrangler/runtime evidence) and update status.

## Related automated evidence

- Constant assertions and edge-cap/signup/daily-limit tests (matrix QR3.1, `docs/nfr/README.md`).
- `backend/tests/Postern.IntegrationTests/Api/CapacityEnvelopeTests.cs`
