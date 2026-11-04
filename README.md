# Postern

A single-purpose, auditable disposable-email platform. Create an alias for each service, forward incoming mail to a primary inbox, and identify unexpected senders.

## Local development

### Prerequisites

- Docker Desktop with Docker Compose
- Node.js 24 and npm 11 (for running the frontend tools directly)
- .NET 10 SDK (for running the backend and tests directly)

### Run the full stack

Before starting the stack, create the ignored service environment files:

```powershell
Copy-Item env/db.env.example env/db.env
Copy-Item env/api.env.example env/api.env
Copy-Item env/web.env.example env/web.env
```

Replace the placeholder passwords with unique local values. The `POSTERN_APP_PASSWORD` in `env/db.env` must match the password in the API connection string in `env/api.env`. Never commit these local `.env` files or use development credentials outside local development. All container environment variables, including `ASPNETCORE_ENVIRONMENT`, are provided using the corresponding service env file.

From the repository root, start the stack:

```powershell
docker compose up --build
```

- Web app: <http://localhost:5173>
- API health endpoint: <http://localhost:8080/health>
- PostgreSQL: `localhost:5432` (database: `postern`)

PostgreSQL initialization creates three distinct roles: `postern` is the local bootstrap superuser used only by the database image; `postern_migrator` owns the private `postern` schema and is intended for schema migrations; `postern_app` is the API runtime login and receives DML permissions only. The API connects using `postern_app` with `postern` as its search path. Access to the default `public` schema is revoked.

The role initializer runs automatically only when PostgreSQL initializes a **new, empty data volume**. If you already have a database volume, preserve it: start the database with `docker compose up -d db`, then run `.\database\initialize-roles.ps1`. This re-applies the idempotent role and schema grants without deleting the volume. Review and migrate any existing application tables into the `postern` schema before switching an application that already has data to the runtime connection.

The API registers PostgreSQL using its runtime role but does not open a database connection for `GET /health`. The initial EF Core migration creates the private `postern` schema and the Day 1 tables. After the database is running and `env/db.env` has valid local credentials, apply migrations with:

```powershell
.\database\migrate.ps1
```

Migrations run as `postern_migrator`; the API only receives the restricted `postern_app` credentials. The migration command does not use or require the bootstrap superuser.

### Day 2 authentication

The API exposes `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/recovery`, `POST /api/auth/logout`, and the authenticated `GET /api/auth/me`. Registration requires a single-use invite and a password of at least 12 characters. The signup cap is 199 accounts; pending verification accounts also count because they reserve destination slots.

Signup and login accept internationalized email addresses, including Unicode local parts (EAI) and Unicode domain names (IDN). Inputs are Unicode-normalized, common international domain separators are accepted, and Unicode domains are validated and compared through their IDNA form. Use the same normalized address at signup and login.

Login checks destination verification for pending accounts before activating them. The first successful verified login returns a one-time recovery key; only its SHA-256 hash is stored. `POST /api/auth/recovery` uses that key to change the password and atomically rotate to a new key. The key is shown only in that response, so save it securely. Login and recovery responses are marked `no-store`.

Authentication uses a one-hour JWT in an `HttpOnly`, `SameSite=Strict` cookie, with `Secure` enabled outside Development. Configure `Authentication__SigningKey` in `env/api.env` with at least 32 bytes of random material; do not use or commit the example placeholder. Registration, login, and recovery are rate-limited per client IP in-process.

Public invite requests are stored for administrator review and do not send mail immediately. Admins can list pending requests at `GET /api/admin/invite-requests`, approve with `POST /api/admin/invite-requests/{requestId}/approve`, reject with `POST /api/admin/invite-requests/{requestId}/reject`, resend an issued invitation with `POST /api/admin/invites/{inviteId}/resend`, and revoke it with `POST /api/admin/invites/{inviteId}/revoke`. Approval and resend write a protected, retryable email job to the PostgreSQL outbox; the hosted worker sends it through Resend. The invite is single-use, expires after seven days, and resend rotates the code and expiry. Revoke cancels queued deliveries and invalidates the invite.

Configure `Resend__ApiKey`, `Resend__WebhookSecret`, `Resend__From`, and `Invites__PublicBaseUrl` in `env/api.env` for local Compose runs, or inject them from your deployment secret manager. `Invites__PublicBaseUrl` must be the absolute public web origin used to build invite links; the API does not assume a URL. Production requires HTTPS for this origin and a persistent writable `DataProtection__KeysPath` shared by all API instances; outbox invite codes are protected with ASP.NET Core Data Protection. Verify the configured sender domain in Resend before sending. Configure Resend's webhook to `POST /api/webhooks/resend` and subscribe to `email.sent`, `email.delivered`, `email.bounced`, and `email.complained`; signatures and replay timestamps are verified before event IDs are persisted. Delivery status means Resend/provider-reported state, not proof the recipient read the message. Email uses inline Postern maroon-and-paper styling, contains no tracking pixels, and does not include a referrer-bearing web page.

In Development, email sending stays disabled when `Resend__ApiKey` is empty; approved messages remain queued until configured. The local invite helper `.\database\create-invite.ps1` remains available for development. In Development only, `POST /api/dev/destinations/{email}/verify` simulates Cloudflare destination verification after signup. The production Cloudflare destination adapter is not yet implemented; production registration and pending-account verification must not be enabled until that adapter is configured.

The API and web development containers run as non-root users. Compose also drops Linux capabilities and enables `no-new-privileges` for both application containers.

The API Dockerfile has an SDK-based `development` target selected by Compose and a multi-stage `production` target that publishes the application and runs only on the ASP.NET runtime image as UID `10001`. The default-deny backend build context allows only C# source and project files.

Stop the containers with `Ctrl+C`, then run `docker compose down`. To remove the local database volume as well, run `docker compose down --volumes`; this permanently deletes local database data.

### Run the web app directly

```powershell
cd web
npm ci
npm run dev
```

The Vite development server proxies `/api/*` to `http://localhost:8080`. Set `VITE_API_PROXY_TARGET` to override that target.

### Run the API directly

```powershell
dotnet run --project backend/src/Postern.Api --urls http://localhost:8080
```

The API listens on <http://localhost:8080> and exposes `GET /health`.

Swagger UI is enabled only when the API runs in the `Development` environment: open <http://localhost:8080/swagger>. The Compose API environment file sets `ASPNETCORE_ENVIRONMENT=Development`; production deployments must set their environment separately.

### Tests and checks

Run frontend checks from `web/`:

```powershell
npm run test:unit
npm run test:integration
npm run test:e2e:install
npm run test:e2e
npm run test:a11y
npm run build
```

`test:integration` uses React Testing Library and MSW. `test:a11y` runs axe-core against the browser-rendered page using WCAG 2.2 AA rules.

Run backend tests from the repository root:

```powershell
dotnet test backend/Postern.slnx
```

The solution contains API, application, domain, and infrastructure projects, plus xUnit unit and API integration tests.

`Postern.UnitTests` runs anywhere. `Postern.IntegrationTests` needs Docker: it starts a disposable PostgreSQL container per test collection, runs the real API pipeline against it, and removes the container when the run ends. See `backend/tests/Postern.IntegrationTests/README.md` for the folder layout and seeding helpers.

## Progressive Web App

The Vite frontend serves a web app manifest and a first-party service worker with install icons. The worker caches the app shell and static assets for offline use, and never caches API responses.
