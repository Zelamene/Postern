# QR6.3 stale-data surface removal record

- **Requirement:** QR6.3 — 100% of stale-data surfaces state the propagation delay and best-effort logging
- **Release / deployment:** redesign/phase5-admin (current codebase state)
- **Recorded on (UTC):** 2026-11-19


## Decision

The shared `StaleDataNotice` banner was removed from the last rendered surface (the admin
dashboard). The user app banner was already removed in the preceding user-pages redesign.
No authenticated surface now renders propagation-delay or best-effort-logging copy as a
data-freshness notice.

With zero rendered stale-data surfaces, QR6.3 is satisfied vacuously: there is no surface on
which the two required statements could be missing. This record replaces presence-based
evidence for the current codebase; the earlier presence evidence remains as a historical
record of the release where the banner was shown.

## Verification

- `web/src/pages/AdminPage.tsx` no longer imports or renders `StaleDataNotice`.
- `web/test/e2e/user/data-freshness.spec.ts` asserts the two statements are absent on
  `/app`, `/app/blocked`, and `/app/aliases/<alias-id>`.
- `web/test/e2e/admin/accessibility.spec.ts` asserts the two statements are absent on `/admin`.
- `web/src/components/common/StaleDataNotice.tsx` is retained only as a historical shared
  implementation; it is not reachable from any current page.

## Result

- **Status:** PASS (no stale-data surfaces rendered)
- **Follow-up:** If a future release reintroduces a stale-data surface, restore a shared notice
  with both canonical statements and add presence assertions before release.
