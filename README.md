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

The role initializer runs automatically only when PostgreSQL initializes a **new, empty data volume**. If you already have a database volume, preserve it: start the database, then apply the initializer once with `docker compose exec -T db psql -U postern -d postern -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/10-postern-roles.sql`. This script is safe to rerun to reapply role passwords and grants. Review and migrate any existing application tables into the `postern` schema before switching an application that already has data to the runtime connection.

The health endpoint is a database-independent liveness check; database schema and application data access will be added with the relevant feature work.

The API and web development containers run as non-root users. Compose also drops Linux capabilities and enables `no-new-privileges` for both application containers.

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

The solution contains the API, domain, xUnit unit-test, and xUnit API integration-test projects.

## Progressive Web App

The Vite frontend is configured with `vite-plugin-pwa`, a web app manifest, generated service-worker registration, and install icons. The service worker is produced during the production build; development mode uses Vite’s normal dev server.
