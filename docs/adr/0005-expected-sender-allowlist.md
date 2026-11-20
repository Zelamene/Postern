# ADR 0005: Match expected senders on the registrable domain, and drop silently

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

The point of Postern is telling mail you expected apart from mail you did not. That needs a rule for
what counts as "the same sender", and a rule for what happens to mail that fails.

## Decision

Two rules.

**Matching.** An expected sender is stored as a registrable domain (eTLD+1) and compared the same
way. `no-reply@mail.shop.example` and `billing@shop.example` are the same expected sender.

**Failing.** Mail that fails policy is dropped. Postern does not reject it with an SMTP error, so the
sender is not told. A blocked row is written so the owner can see it — but only when the alias is
known. Mail for an unknown recipient is dropped with no row at all, because there is no owner to
charge the write to and no alias to attach it to.

## Alternatives considered

- **Match the full address.** More precise, but services send from many addresses on one domain
  (`no-reply@`, `billing@`, `news@`), which would mean constant manual additions.
- **Reject with a 5xx so the sender learns.** Rejected: it confirms the alias exists to whoever
  probed it, and it invites retries from legitimate senders.
- **Quarantine and let the user release.** Rejected: it means holding the message, which contradicts
  ADR 0004.

## Consequences

The allowlist is cheap to maintain, and blocked mail leaves a visible trace for real aliases.

**Least comfortable:** two things.

1. eTLD+1 conflates subdomains. A rule meant for a bank also lets through anything on a compromised
   or attacker-controlled subdomain of that bank.
2. Silent drops are invisible in both directions. The sender gets no signal, and for an unknown
   alias the owner gets no row either, so a user who mistypes their own alias sees mail vanish with
   nothing to point at.
