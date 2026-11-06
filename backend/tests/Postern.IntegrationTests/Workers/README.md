# Worker boundary tests

The email worker (`worker/`) is a Cloudflare Worker with its own TypeScript toolchain, so it does
not run inside this xUnit project. What this project verifies is the contract between the worker and
the API:

- `Flows/IngestFlowTests.cs` posts the same payload shape the worker sends to `POST /api/ingest`
  and then reads the result back through the Day 7 activity endpoints.
- `Constraints/DatabaseConstraintTests.cs` guards the storage invariants that make that audit trail
  trustworthy (tombstones keep their hash, subjects stay bounded, auth results stay enumerated).

Forwarding, KV gating, blocked-message decisions, and best-effort ingest are covered by the
`worker/` Vitest suite (`npm test` there). Keep this folder for cross-boundary assertions only.
