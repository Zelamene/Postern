# Architecture Decision Records


Each note is one file in [`docs/adr/`](adr/). The format is the same in all of them:

- **Context** — what made this a decision at all.
- **Decision** — what the system does now.
- **Alternatives considered** — what was rejected, and why.
- **Consequences** — what we gain, plus the one consequence that is least comfortable.


## The decisions

| # | Decision | Status | File |
| --- | --- | --- | --- |
| 0001 | The mail path runs in a Worker, the management API in ASP.NET Core | Accepted | [0001-two-runtimes.md](adr/0001-two-runtimes.md) |
| 0002 | KV is a copy of the database, not a source of truth | Accepted | [0002-kv-is-a-projection.md](adr/0002-kv-is-a-projection.md) |
| 0003 | Forward first, log second; activity logging is best effort | Accepted | [0003-activity-log-is-best-effort.md](adr/0003-activity-log-is-best-effort.md) |
| 0004 | Store message headers only, never bodies | Accepted | [0004-headers-only-storage.md](adr/0004-headers-only-storage.md) |
| 0005 | Match expected senders on the registrable domain, and drop silently | Accepted | [0005-expected-sender-allowlist.md](adr/0005-expected-sender-allowlist.md) |
| 0006 | The admin audit log is append-only, and attribution beats deletion | Accepted | [0006-append-only-audit-log.md](adr/0006-append-only-audit-log.md) |
| 0007 | One session cookie, no refresh tokens, TOTP required for admins | Accepted | [0007-session-cookies.md](adr/0007-session-cookies.md) |
| 0008 | Migrations are applied by the pipeline, never at startup, and rollback goes forward | Accepted | [0008-forward-only-migrations.md](adr/0008-forward-only-migrations.md) |
| 0009 | Signup is invite-only, with a hard cap of 199 accounts | Accepted | [0009-invite-only-account-cap.md](adr/0009-invite-only-account-cap.md) |
| 0010 | The alias suffix is generated on the server and dead addresses are never reused | Accepted | [0010-alias-suffix-and-tombstones.md](adr/0010-alias-suffix-and-tombstones.md) |

## Adding a new note

1. Take the next free number and name the file `NNNN-short-title.md`.
2. Copy the four headings above. Keep it to one page.
3. Add a row to the table in this file.
4. If the note replaces an earlier decision, leave the old one in place and change its status to
   `Superseded by NNNN` rather than deleting it.
