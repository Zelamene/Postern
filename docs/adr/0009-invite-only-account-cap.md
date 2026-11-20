# ADR 0009: Signup is invite-only, with a hard cap of 199 accounts

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

Postern is a single-purpose service, not a public email provider. An open signup form on a service
that accepts mail is an invitation to be used as a relay or as a spam target.

There is also a sizing question. The non-functional targets — KV writes per day, mail-path CPU per
message, ingest throughput — are easier to state and to prove against a known number of accounts.

## Decision

- Nobody self-registers. An admin issues a single-use invite bound to one email address, and the
  invite is the only way in.
- Registration is capped at 199 accounts. The cap is checked at registration and returns
  `user_limit_reached` at 200.

## Alternatives considered

- **Open signup.** Rejected: it turns the service into a target and changes the abuse model
  completely.
- **A waitlist with automatic admission.** Rejected: it is open signup with extra steps, and it
  removes the deliberate review an invite represents.
- **No numeric cap, just invites.** Rejected: "however many people we invite" cannot be sized or
  tested against.

## Consequences

Growth is deliberate, abuse has a person behind it, and every load and budget number has a stated
population to be measured against.

**Least comfortable:** the number 199 comes from a resource budget, and it is now a product rule
baked into registration, the rate-limit projections and the load-test dataset. Lowering it is easy;
raising it means re-taking the KV and throughput measurements that were made at that population.
The cap is also the kind of limit users will ask about, and the honest answer is "because we measured
it at that size", not "because of a licence".
