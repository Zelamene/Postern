# ADR 0006: Make the admin audit log append-only, and let attribution beat deletion

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

Every admin action is recorded. That record is worth nothing if it can be edited or deleted, and it
is worth little if the admin who did it can be anonymised afterwards by a cascade delete.

The application role already has write access to all tables, and that access is extended to future
tables automatically. Grants alone are fragile.

## Decision

1. The `admin_audit_log` table has a trigger that raises an error on `UPDATE` and `DELETE`. The
   application cannot rewrite history even though it holds the grant.
2. The foreign key from the audit log to the admin account was dropped, so no cascade can erase
   attribution.
3. Account deletion is refused with `409` while that account is named on audit rows.

## Alternatives considered

- **REVOKE the write grants and stop there.** Rejected as the only defence: one migration that
  re-grants, or a role re-initialisation, undoes it. The trigger is the authoritative guard.
- **Keep the log in a separate event store or service.** Rejected: more infrastructure for a table
  that is written rarely and read by one screen.
- **Ship the log to external write-once storage.** Not rejected on merit, but out of scope for the
  current system. This is the natural next step if the requirement grows.

## Consequences

Admin history survives application bugs, careless migrations and cascade deletes, and the trail is
readable in place.

**Least comfortable:** an account that has ever been touched by an admin cannot be deleted. That is a
deliberate refusal of an erasure request in a product whose selling point is that it holds almost
nothing about you. The log also lives in the same database, under a neighbouring role, as the data
it audits: this is tamper-evident against the application, not against a database administrator who
can drop the trigger.
