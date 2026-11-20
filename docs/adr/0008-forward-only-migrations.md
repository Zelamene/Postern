# ADR 0008: Migrations are applied by the pipeline, never at startup, and rollback goes forward

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

The schema changes often, and the API must never start against a schema it does not expect. A common
shortcut is to run migrations when the app boots, or to roll a bad release back by running the
migration's `Down()`.

Both are tempting and both are dangerous once more than one instance is running.

## Decision

- Migrations are applied by the CD pipeline, as a step of their own, after a `pg_dump` of the
  database.
- The application never migrates on startup.
- `Down()` exists because EF Core requires it, but it is not the rollback mechanism. A bad release is
  fixed by shipping another migration that moves the schema forward.
- Changes are written to be additive first: add the column, deploy code that uses it, and only then
  remove the old one. A migration that narrows a contract is a deliberate decision, not routine.

## Alternatives considered

- **Migrate on startup.** Rejected: concurrent instances race, and a failed migration takes the API
  down with it.
- **Roll back by running `Down()`.** Rejected: `Down()` drops data, and it runs against a database
  the old code no longer matches halfway through.
- **Hand-written SQL applied by a DBA.** Rejected: it removes the schema from review and from the
  test that applies all migrations to an empty database.

## Consequences

Every deploy has a known schema and a dump taken just before the change, and the migration set is
tested from empty on every build.

**Least comfortable:** there is no way back, only forward, and the correction happens under time
pressure while the previous version is still serving. The `pg_dump` is the only real safety net, and
a migration that tightens a contract is only safe because of something outside the migration — for
example, the audit-log trigger was safe because nothing in the API ever updated that table. That
knowledge lives in review comments, not in a check.
