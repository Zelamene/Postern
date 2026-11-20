# ADR 0010: Generate the alias suffix on the server and never reuse a dead address

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

Alias addresses are handed out to services, and some of those services will keep them for years.
Two risks follow: an address that is easy to guess gets spam, and an address that can be released
and reissued can deliver mail to the wrong person after the original owner leaves.

## Decision

- The user picks the label; the server adds a random four-character suffix. The full address is
  `{label}.{random4}@{domain}`.
- Generated addresses are checked against a tombstone table. Creation retries a few times if the
  address was used before.
- Deleting or replacing an alias adds its address to the tombstones. That address is never issued
  again.

## Alternatives considered

- **Let the user choose the whole address.** Rejected: predictable addresses get spam, and the user
  can claim an address that looks like someone else's.
- **Reuse addresses after deletion.** Rejected: mail for the old owner would land with the new one,
  which is a data leak that is invisible until it happens.
- **No suffix at all, label only.** Rejected: it makes two users asking for `shop` collide, and it
  makes the address trivially guessable.

## Consequences

Addresses are not guessable, and a released address can never deliver to a new owner.

**Least comfortable:** tombstones grow forever and are never cleaned up, so one table only ever gets
bigger, and every alias creation pays for a lookup against it. And the rule is absolute: a user who
deletes an alias by mistake cannot get it back, even if the address has never received a single
message. That is the correct trade against misdelivery, but it is a support conversation every time
it happens.
