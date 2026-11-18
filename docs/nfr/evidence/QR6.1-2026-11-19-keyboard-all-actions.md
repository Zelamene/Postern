# QR6.1 keyboard-only operation review (all actions)

- **Requirement:** QR6.1 — 0 serious/critical violations; WCAG 2.1 AA; keyboard-only operation of all actions
- **Reviewed on (UTC):** 2026-11-19
- **Reviewed by:** automated code/structure review (agent-assisted)
- **Scope:** user and admin UI actions in `web/src` (pages, app/admin components, common controls). This record complements automated axe scans and existing keyboard journeys.

## Automated coverage in place

- **Public axe CI gate:** `web-ci.yml` runs `./node_modules/.bin/playwright test --config playwright.public-ci.config.ts` ("Public accessibility scan (QR6.1)") using `web/test/e2e/public/brand-guide.spec.ts` WCAG 2.2 AA checks.
- **Nightly axe scans:** public (light/dark), signed-in user, and signed-in admin axe scans (`web/test/e2e/support/a11y.ts`, `web/test/e2e/user/accessibility.spec.ts`, `web/test/e2e/admin/accessibility.spec.ts`, `.github/workflows/browser-nightly.yml`), recorded in `docs/nfr/evidence/QR6.1-2026-11-18.json` (0 violations, 5/5 runs).
- **Nightly keyboard journey (core):** `web/test/e2e/user/accessibility.spec.ts` — "a core alias journey is operable by keyboard alone" (create alias) passed 5/5 runs (evidence `QR6.1-2026-11-18.json`).

## Implementation patterns supporting keyboard operability

- Interactive actions are implemented primarily with native semantic controls: `<button>`, `<a>`/`AppLink` (`web/src/components/app/AppLink.tsx`), `<input>`, `<select>`, `<label>`, and native `<dialog>` (`ConfirmationDialog`, `ReplaceAliasDialog`), which are focusable and activatable by keyboard by default.
- Visible focus/disabled/busy states are expressed via standard attributes/classes (`disabled`, `aria-busy`, `aria-pressed`, `aria-expanded`, `aria-current`, labeled controls/landmarks).
- Menu/dialog keyboard behavior: `NotificationMenu` closes on `Escape` and restores focus to trigger (`web/src/components/common/NotificationMenu.tsx`); confirmation dialogs trap interaction via native `<dialog>.showModal()` and expose cancel/confirm buttons.
- No `onClick` handlers were found on non-interactive elements requiring custom key handling in application source during review (actions bound to buttons/links/inputs).

## Action inventory and keyboard review

| Surface | Actions | Primary controls | Keyboard expectation | Notes |
|---|---|---|---|---|
| Public/auth & navigation | Sign in/out links, request invite, theme toggle, skip/main navigation patterns | `<a>`/links, `<button>` | Tab focus, Enter/Space activate | Covered by public axe gate/nightly scans |
| App header (`AppHeader`) | Navigate Aliases/Blocked/Account, sign out, theme toggle (desktop/mobile), open notifications | `AppLink`, `<button>`, `NotificationMenu` | Tab/Enter/Space; menu Escape/Enter | `aria-current`, labeled icon buttons |
| Notifications (`NotificationMenu`) | Open/close menu, mark all read, select notification | `<button>`, dialog panel | Tab, Enter/Space, Escape closes and returns focus | Focus moved into panel on open |
| User aliases (`AliasComposer`, `AliasList`) | Fill label/category/expected sender, submit create, refresh, dismiss errors, copy address, open activity, disable/delete (with confirmation/match) | Inputs/selects/buttons, `AppLink`, `ConfirmationDialog` | Tab through fields/buttons, Enter submits/forms, Space activates buttons, dialog focusable controls | Core create journey covered by nightly keyboard test |
| Alias activity (`AliasActivity`, `ReplaceAliasDialog`) | Export CSV, replace address flow (reserve/copy/confirm checklist), load older, mark expected, block sender (with confirmations), back link | Buttons, dialog, checkbox, links | Tab/Enter/Space; native dialog/checkbox semantics | Multi-step dialog actions keyboard-operable via native controls |
| Blocked mail (`BlockedActivity`) | Load older messages | `<button>` | Tab/Enter/Space |  |
| Account (`AccountSettings`) | Update forwarding destination, open/delete account with typed confirmation | Form input/button, dialog with text confirmation | Tab/Enter submit/activate, typed confirmation input | Delete protected by explicit confirmation dialog |
| Admin auth (`AdminAuthPanel`) | Sign in, MFA setup/verify (including authenticator URI link), sign out (forbidden state), back link | Forms/inputs/buttons/links | Tab/Enter/Space; labeled inputs and submit buttons |  |
| Admin header (`AdminHeader`) | Home link, sign out, notifications, theme toggle | `<a>`, `<button>` | Tab/Enter/Space |  |
| Invite dashboard (`AdminInviteDashboard`) | Refresh, approve/reject requests, resend/revoke invites, reject confirmation dialog | Buttons, `ConfirmationDialog`, `RecoveryKeyNotice` actions | Tab/Enter/Space; dialog controls focusable | Revoke uses `window.confirm` in addition to other confirmations (browser-native, keyboard-accessible) |
| Analytics (`AdminAnalyticsBoard`) | Change window (24h/7d), retry reload, expand audit metadata | Toggle buttons (`aria-pressed`), `<details>/<summary>` | Tab/Enter/Space; native disclosure |  |
| Global blocklist (`AdminBlocklistPanel`) | Add domain/reason, retry, unblock (confirmation dialog) | Form inputs/buttons, dialog | Tab/Enter/Space |  |
| KV sync (`AdminKvSyncPanel`) | Trigger sync now | `<button>` | Tab/Enter/Space | Nightly core-task timing covers sync task; keyboard operability via native button |
| Common notices (`RecoveryKeyNotice`, stale-data notice) | Copy recovery key, dismiss notice | `<button>` | Tab/Enter/Space |  |

## Result

- **Status:** EVIDENCED (automated + code-review checklist). Public CI axe gate is wired; nightly axe and core keyboard journey pass; UI actions reviewed are implemented with native, focusable controls and standard dialog/menu patterns supporting keyboard-only operation.
- **Residual note:** Automated end-to-end keyboard scripting currently proves a core user journey; this checklist documents full action coverage by implementation review and control semantics. Future releases should extend scripted keyboard journeys when adding new complex interactions.

## References

- `docs/nfr/evidence/QR6.1-2026-11-18.json`
- `.github/workflows/web-ci.yml` (Public accessibility scan, QR6.1)
- `web/playwright.public-ci.config.ts`
- `web/test/e2e/user/accessibility.spec.ts`, `web/test/e2e/admin/accessibility.spec.ts`, `web/test/e2e/support/a11y.ts`
- `.github/workflows/browser-nightly.yml`
