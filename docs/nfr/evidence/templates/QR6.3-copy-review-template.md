# QR6.3 stale-data copy review record (per release)

Use this template to record the manual copy review required by QR6.3 for each release. Automated nightly assertions verify presence of the required statements on known stale-data surfaces; this review confirms wording, placement, and completeness for the release.

- **Requirement:** QR6.3 — 100% of stale-data surfaces state the propagation delay and best-effort logging
- **Release / deployment:** <!-- version, tag, commit, or release id -->
- **Reviewed on (UTC):** <!-- YYYY-MM-DD -->
- **Reviewed by:** <!-- name/handle -->

## Checklist

- [ ] All known stale-data surfaces reviewed (user and admin, including any newly added in this release).
- [ ] Each stale-data surface states the **propagation delay** clearly.
- [ ] Each stale-data surface states **best-effort logging** clearly.
- [ ] Copy is accurate for current behavior/configuration (no stale wording after product/config changes).
- [ ] Any new surface added in this release is covered by automated assertions or tracked as follow-up.

## Surfaces reviewed

| Surface | Location (route/component) | Propagation delay stated? | Best-effort logging stated? | Notes |
|---|---|---:|---:|---|
| <!-- e.g. User dashboard stale notice --> |  | Yes/No | Yes/No |  |
|  |  |  |  |  |

## Result

- **Status:** <!-- PASS / PASS with notes / FAIL -->
- **Summary:**
  - 
- **Follow-ups (if any):**
  - 

## Related automated evidence

- `web/src/components/common/StaleDataNotice.tsx`
- `web/test/e2e/user/data-freshness.spec.ts`, `web/test/e2e/admin/accessibility.spec.ts`
- `docs/nfr/evidence/QR6.3-2026-11-18.json` and nightly workflow (`.github/workflows/browser-nightly.yml`)
