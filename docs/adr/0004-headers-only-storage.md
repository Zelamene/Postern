# ADR 0004: Store message headers only, never message bodies

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

To show "who emailed this alias", Postern needs a small amount of information about each message.
It does not need the message itself. Holding mail bodies would turn Postern into a mail store, with
all the privacy, retention and breach consequences that follow.

## Decision

The mail tables keep metadata only:

- no body column exists in any mail table;
- the `From` header is normalised to its registrable domain;
- the subject is stored truncated to 60 characters, with a database check constraint on the length;
- activity rows are kept for 90 days.

The message itself is forwarded and then forgotten.

## Alternatives considered

- **Store the body in object storage, encrypted.** Rejected: it makes Postern a place where other
  people's mail accumulates, and one key mistake away from a serious breach.
- **Store a short snippet for support and abuse work.** Rejected for the same reason. There is no
  snippet column, on purpose.
- **Store nothing but counters.** Rejected: the product's core feature is showing the user which
  service emailed them and when.

## Consequences

The most sensitive content never reaches the system, so a database leak exposes addresses and
subjects, not conversations. Retention can be short and cheap.

**Least comfortable:** you cannot answer "what did that message actually say" — not for a user
dispute, not for an abuse report, not when debugging a false block. The 60 character subject is a
lossy signal chosen for storage reasons; it is often not enough to tell what a message was. If a
future requirement needs bodies, this decision has to be reopened, not quietly worked around.
