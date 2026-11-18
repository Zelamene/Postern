# QR3.1 topology review record (per release)

Use this template to record the manual topology review required by QR3.1 for each release/deployment.

- **Requirement:** QR3.1 — 199 accounts; 500 forwarded messages per account per 24 h; one API instance
- **Release / deployment:** <!-- version, tag, commit, or release id -->
- **Environment:** <!-- production / staging -->
- **Reviewed on (UTC):** <!-- YYYY-MM-DD -->
- **Reviewed by:** <!-- name/handle -->

## Checklist

- [ ] **Account ceiling:** configuration/topology supports the 199-account limit as intended (record source of truth and enforcement point).
- [ ] **Forwarding cap:** 500 forwarded messages per account per 24 h enforced by the deployed edge/API logic as intended (reference gate tests/config).
- [ ] **API instance count:** exactly one API instance is deployed/active for this environment (or topology otherwise matches the documented single-instance assumption).
- [ ] Deployed configuration matches reviewed manifests/settings (worker, API, database, KV bindings).
- [ ] No topology change in this release invalidates prior QR3.1 assumptions; if changed, impact assessed.

## Evidence

- **Deployment topology/source reviewed:** <!-- dashboard, IaC/manifests, wrangler config, compose/prod config, screenshots -->
- **Account/cap configuration evidence:**
  - 
- **Instance count evidence:**
  - 
- **Related commits/config:** 

## Result

- **Status:** <!-- PASS / PASS with notes / FAIL -->
- **Summary:**
  - 
- **Follow-ups (if any):**
  - 

## Related automated evidence

- Constant assertions and edge-cap/signup/daily-limit tests (matrix QR3.1, `docs/nfr/README.md`).
