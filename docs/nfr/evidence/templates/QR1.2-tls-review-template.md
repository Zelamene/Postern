# QR1.2 TLS review record (per environment)

Use this template to record the manual TLS review required by QR1.2 for each environment. Keep the quantified requirement text unchanged in the matrix; this file records the environment-specific TLS posture.

- **Requirement:** QR1.2 — 100% of passwords hashed, recovery keys hashed and rotated, protected values decryptable after restart; 0 secrets in artifacts
- **Environment:** <!-- e.g. production / staging -->
- **Reviewed on (UTC):** <!-- YYYY-MM-DD -->
- **Reviewed by:** <!-- name/handle -->
- **Scope:** <!-- public web origin, API origin, admin endpoints, ingress/proxy, certificates -->

## Checklist

- [ ] Public HTTPS endpoint(s) identified and reachable only over TLS in this environment.
- [ ] Certificate chain valid (issuer, hostname/SAN, expiry, no obvious misconfiguration).
- [ ] TLS termination point documented (CDN/proxy/load balancer/app) and consistent with deployment topology.
- [ ] HTTP-to-HTTPS redirect or HSTS behavior reviewed as applicable.
- [ ] Deprecated/insecure protocol or cipher exposure checked with the chosen tool (record tool/output summary below).
- [ ] No plaintext secret material observed in reviewed transport/config artifacts for this environment.
- [ ] Any exceptions, compensating controls, or follow-up actions recorded.

## Evidence

- **Endpoints reviewed:**
  - 
- **Tooling/commands used:** <!-- e.g. browser cert inspection, ssllabs/scan output, openssl s_client, cloud provider dashboard -->
- **Observed certificate details:** <!-- subject, issuer, valid from/to -->
- **Observed TLS/protocol notes:**
  - 
- **Screenshots/artifacts:** <!-- paths or links, if any -->

## Result

- **Status:** <!-- PASS / PASS with notes / FAIL -->
- **Summary:**
  - 
- **Follow-ups (if any):**
  - 

## Related automated evidence

- Hashing/rotation unit tests and restart-with-persisted-keys integration test (`docs/nfr/README.md`, matrix QR1.2).
- Secret scanning via Gitleaks in CI (`.gitleaks.toml`, `backend-ci.yml`, `web-ci.yml`).

> Note: the QR1.2 matrix caveat records that PostgreSQL-backed Data Protection keys are currently unencrypted at rest (`ProtectKeysWithCertificate` undecided). This TLS review does not change that caveat.
