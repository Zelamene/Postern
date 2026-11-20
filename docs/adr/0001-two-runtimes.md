# ADR 0001: Run the mail path in a Worker and the management API in ASP.NET Core

- **Status:** Accepted
- **Date:** 2026-11-20

## Context

Postern does two very different jobs. Incoming mail has to be judged in milliseconds and has to keep
working even when the backend is unhealthy. The management side (accounts, aliases, invitations,
admin actions, audit log) needs transactions, a relational schema and migrations.

One process cannot be good at both. Building them together would mean the mail path inherits the
availability of the API.

## Decision

Split the system into two runtimes:

- **Mail path:** a Cloudflare Email Worker. It reads the alias record and the block/rate-limit
  policy from Workers KV, decides, and calls `message.forward()` or drops the message. It never
  opens a database connection.
- **Management plane:** an ASP.NET Core API backed by PostgreSQL. It owns every write, the audit
  log and the migrations.

The Worker reports what it did to the API with one HTTP call (`POST /api/ingest`). The two sides
share a few JSON files in `shared/` so the same facts are described in one place.

## Alternatives considered

- **One .NET service handling mail and management.** Simpler: one code base, one model, one test
  suite. Rejected because every deploy, cold start or database problem would then delay or lose
  mail.
- **Worker writing to PostgreSQL directly.** Rejected: connection limits, and it puts the database
  back on the mail path.
- **Durable Objects for policy state.** Rejected. Policy is read-mostly and small; KV is enough
  machinery.

## Consequences

Mail keeps flowing while the API is down or deploying, and the two halves can scale and fail
independently.

**Least comfortable:** the same policy rules now exist twice, once in TypeScript and once in C#,
with two test suites. Nothing structural stops them drifting apart. Only the facts written down in
`shared/` are checked against both runtimes, so any rule that is not in a contract file can quietly
disagree. Every policy change has to be remembered in two places.
