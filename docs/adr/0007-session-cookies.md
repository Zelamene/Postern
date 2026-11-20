# ADR 0007: Use one session cookie, no refresh tokens, and require TOTP for admins

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

The app is a browser front end and one API on the same site. Sessions must work without a token
store, must not be readable by JavaScript, and admin access must be harder to steal than user
access.

## Decision

- A single `Postern.Auth` cookie holds an HS256 JWT. It is `HttpOnly`, `SameSite=Strict`, and
  `Secure` outside Development.
- Sessions last 1 hour for users, 15 minutes for admins. There is no refresh endpoint and no bearer
  token flow: when it expires, the user signs in again.
- Admin login is a two-step flow. The password step issues a short-lived `Postern.AdminMfa` challenge
  cookie; only a verified TOTP code produces a session. Admin-only routes require an `amr=totp`
  claim that is checked against the account's current enrollment, so an old cookie from before
  enrollment is rejected.
- Logout deletes the cookie.

## Alternatives considered

- **An external identity provider (OIDC).** Rejected: another dependency and another outage surface
  for a closed, invite-only product with one small user base.
- **Opaque sessions in the database.** Would allow real revocation, but adds a database round trip to
  every request. Rejected for the current scale.
- **Access token plus refresh token.** Rejected: it exists to serve long-lived API clients. This app
  has none.

## Consequences

No session store to run, no refresh flow to get wrong, and a stolen admin cookie is useless within
15 minutes.

**Least comfortable:** logout is only a cookie deletion. Nothing on the server is invalidated, so a
copied cookie stays valid until it expires — acceptable only because of the 15 minute admin window.
The signing key is a single shared secret with no rotation story written down, which means rotating
it signs everyone out at once, and nobody has practised doing that.
