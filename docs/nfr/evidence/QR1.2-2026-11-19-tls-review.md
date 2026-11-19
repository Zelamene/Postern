# QR1.2 TLS / secrets posture review record

- **Requirement:** QR1.2 — 100% of passwords hashed, recovery keys hashed and rotated, protected values decryptable after restart; 0 secrets in artifacts
- **Environment:** repository / CI controls reviewed from `origin/main` snapshot (no deployed environment access)
- **Reviewed on (UTC):** 2026-11-19
- **Scope:** repo-verifiable controls (hashing, recovery keys, Data Protection persistence/restart, secret scanning) and per-environment TLS posture

## Checklist

- [ ] Public HTTPS endpoint(s) identified and reachable only over TLS in this environment. **Operator verification pending (deployed environment access required).**
- [ ] Certificate chain valid (issuer, hostname/SAN, expiry, no obvious misconfiguration). **Operator verification pending.**
- [ ] TLS termination point documented (CDN/proxy/load balancer/app) and consistent with deployment topology. **Operator verification pending.**
- [ ] HTTP-to-HTTPS redirect or HSTS behavior reviewed as applicable. **Operator verification pending.**
- [ ] Deprecated/insecure protocol or cipher exposure checked with the chosen tool (record tool/output summary below). **Operator verification pending.**
- [x] No plaintext secret material observed in reviewed transport/config artifacts for this repository state via CI secret scanning controls (Gitleaks configured in workflows). **Per-environment/config artifact review still pending.**
- [x] Exceptions, compensating controls, and follow-up actions recorded.

## Repo-verifiable evidence

- **Passwords hashed:** `AuthenticationService.MaximumUsers` / account flows use password hashing infrastructure in the application; hashing behavior is covered by existing unit/integration tests referenced by the matrix/README.
- **Recovery keys hashed and rotated:** recovery key digests/rotation covered by existing QR1.2 gate tests (matrix/README).
- **Protected values decryptable after restart (database-backed key ring):** `backend/tests/Postern.IntegrationTests/Database/DataProtectionRestartTests.cs` proves a protected value remains readable by a second host with only the database configured. Data Protection keys persisted in PostgreSQL (`AddDataProtectionKeys` migration; `DataProtectionKeys` DbSet/context wiring in `Postern.Infrastructure` and API configuration).
- **0 secrets in artifacts (CI control):** Gitleaks secret scan configured and run in CI (`.gitleaks.toml`, `.github/workflows/backend-ci.yml`, `.github/workflows/web-ci.yml`).
- **Known caveat (unchanged):** PostgreSQL-backed Data Protection key XML is currently unencrypted at rest; `ProtectKeysWithCertificate` is undecided/not claimed here (see `docs/nfr/README.md` decision).

## Per-environment TLS review (operator required)

- **Endpoints reviewed:**
  - Pending — requires access to deployed public web/API/admin origins.
- **Tooling/commands used:** <!-- e.g. browser cert inspection, ssllabs/scan output, openssl s_client, cloud provider dashboard -->
- **Observed certificate details:** <!-- subject, issuer, valid from/to -->
- **Observed TLS/protocol notes:**
  - Pending operator inspection per environment.
- **Screenshots/artifacts:** <!-- paths or links, if any -->

## Result

- **Status:** PARTIAL — repo/CI controls evidenced; **per-environment TLS/operator verification pending** (cannot be recorded as PASS without deployed endpoint inspection)
- **Summary:**
  - Hashing/recovery-key and restart-persisted Data Protection behaviors are covered by executable tests; secret scanning is wired in CI.
  - TLS termination, certificate validity, protocol/cipher posture, and redirect/HSTS behavior remain unverified for deployed environments in this review.
- **Follow-ups (if any):**
  - Perform and record TLS review per environment using this template (endpoints, cert chain, termination, protocol/cipher checks, redirect/HSTS) and update status accordingly.

## Related automated evidence

- Hashing/rotation unit tests and restart-with-persisted-keys integration test (`docs/nfr/README.md`, matrix QR1.2).
- `backend/tests/Postern.IntegrationTests/Database/DataProtectionRestartTests.cs`
- Secret scanning via Gitleaks in CI (`.gitleaks.toml`, `backend-ci.yml`, `web-ci.yml`).

> Note: the QR1.2 matrix caveat records that PostgreSQL-backed Data Protection keys are currently unencrypted at rest (`ProtectKeysWithCertificate` undecided). This TLS review does not change that caveat.
