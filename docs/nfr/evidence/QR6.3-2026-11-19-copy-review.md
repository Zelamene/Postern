# QR6.3 stale-data copy review record

- **Requirement:** QR6.3 — 100% of stale-data surfaces state the propagation delay and best-effort logging
- **Release / deployment:** `origin/main` snapshot `912ddc2` (reviewed for current codebase/release state)
- **Reviewed on (UTC):** 2026-11-19
- **Reviewed by:** automated code review (agent-assisted)

## Checklist

- [x] All known stale-data surfaces reviewed (user and admin, including any newly added in this release).
- [x] Each stale-data surface states the **propagation delay** clearly.
- [x] Each stale-data surface states **best-effort logging** clearly.
- [x] Copy is accurate for current behavior/configuration (shared product copy; no divergent wording found).
- [x] No new stale-data surface identified in this review outside the shared component coverage; nightly assertions remain in place.

## Surfaces reviewed

| Surface | Location (route/component) | Propagation delay stated? | Best-effort logging stated? | Notes |
|---|---|---:|---:|---|
| User app shell (all signed-in user views) | `web/src/pages/AppPage.tsx` renders `<StaleDataNotice />` in the main app layout (covers aliases, messages/alias activity, blocked, account views) | Yes | Yes | Uses shared `StaleDataNotice` with `aria-label="Data freshness"`. |
| Admin dashboard shell | `web/src/pages/AdminPage.tsx` renders `<StaleDataNotice />` in the admin layout | Yes | Yes | Same shared component/copy. |

**Shared implementation:**
- Component: `web/src/components/common/StaleDataNotice.tsx` — renders "About this data", propagation delay, and best-effort logging.
- Copy: `web/src/services/productCopy.ts`
  - `PROPAGATION_DELAY_NOTICE = "Routing changes can take up to 24 hours to propagate everywhere, usually within 3 minutes."`
  - `BEST_EFFORT_LOGGING_NOTICE = "Activity and delivery records are logged on a best-effort basis and are not guaranteed."`

**Search/review scope:** `git grep` over `web/src` for `StaleDataNotice`, `PROPAGATION_DELAY_NOTICE`, `BEST_EFFORT_LOGGING_NOTICE`, and stale/propagation/best-effort terms found no additional stale-data surfaces outside the shared component.

## Result

- **Status:** PASS (current codebase/release-state copy review)
- **Summary:**
  - All identified stale-data surfaces (user app shell and admin shell) present the propagation delay and best-effort logging statements via the shared `StaleDataNotice` component and canonical `productCopy` strings.
  - Wording is consistent across surfaces; automated nightly assertions continue to verify presence on known surfaces.
- **Follow-ups (if any):**
  - Re-run this review for future releases that add or change stale-data surfaces/copy; extend automated assertions if new surfaces are introduced.

## Related automated evidence

- `web/src/components/common/StaleDataNotice.tsx`
- `web/test/e2e/user/data-freshness.spec.ts`, `web/test/e2e/admin/accessibility.spec.ts`
- `docs/nfr/evidence/QR6.3-2026-11-18.json` and nightly workflow (`.github/workflows/browser-nightly.yml`)
