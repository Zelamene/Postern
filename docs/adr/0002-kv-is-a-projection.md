# ADR 0002: Treat KV as a copy of the database, not as a source of truth

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

The Worker needs alias and policy data with very low latency, and it must not touch PostgreSQL. That
means the data it reads lives somewhere else, and somewhere else means it can be out of date.

The question is what the system promises when the copy and the database disagree.

## Decision

PostgreSQL is the only source of truth. Workers KV holds a **projection** that can be rebuilt from
the database at any time.

- A change is written to the database first, then published to KV.
- If the KV write fails, the user request still succeeds. The alias is marked `kvDirty` and a
  background sync repairs it.
- A full sync can rebuild the whole namespace from the database, including deleting keys for
  aliases that no longer exist.
- The Worker reads with a 60 second cache TTL, so KV data has a known, bounded age.

## Alternatives considered

- **Read-through cache filled on demand by the API.** Rejected: a cold key would put a database call
  on the mail path.
- **Failing the user request when the KV write fails.** Rejected: the alias exists in the database
  and will work once the repair runs; failing the request would only lose the user's work.
- **Strongly consistent storage.** Rejected: it costs the low latency and the global read that the
  mail path depends on.

## Consequences

The mail path can answer from memory-near data and stays available when the sync is broken. Repairs
are possible because the projection is disposable.

**Least comfortable:** "disable this alias" does not take effect immediately. Between the database
write, the KV put and up to 60 seconds of cache, a disabled or replaced alias can still forward mail.
There is no promise tighter than that anywhere in the product, and the UI says so on every page that
shows possibly-stale data. Someone lowering a cache TTL later, to make the UI feel fresher, would
silently weaken this.
