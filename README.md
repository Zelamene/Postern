<p align="center">
  <img src="web/public/postern.svg" alt="Postern logo" width="64" height="64" />
</p>

# Postern

<p align="center">
  <a href="https://github.com/Zelamene/Postern/actions/workflows/Pipeline.yml"><img src="https://github.com/Zelamene/Postern/actions/workflows/Pipeline.yml/badge.svg" alt="Postern Pipeline" /></a>
  <a href="https://github.com/Zelamene/Postern/actions/workflows/web-ci.yml"><img src="https://github.com/Zelamene/Postern/actions/workflows/web-ci.yml/badge.svg" alt="Web CI" /></a>
  <a href="https://github.com/Zelamene/Postern/actions/workflows/backend-ci.yml"><img src="https://github.com/Zelamene/Postern/actions/workflows/backend-ci.yml/badge.svg" alt="Backend CI" /></a>
  <a href="https://github.com/Zelamene/Postern/actions/workflows/nfr-ci.yml"><img src="https://github.com/Zelamene/Postern/actions/workflows/nfr-ci.yml/badge.svg" alt="NFR Gate" /></a>
  <a href="https://sonarcloud.io/summary/new_code?id=Zelamene_Postern"><img src="https://sonarcloud.io/api/project_badges/measure?project=Zelamene_Postern&amp;metric=alert_status" alt="SonarCloud quality gate" /></a>
  <a href="https://sonarcloud.io/summary/new_code?id=Zelamene_Postern"><img src="https://sonarcloud.io/api/project_badges/measure?project=Zelamene_Postern&amp;metric=coverage" alt="SonarCloud coverage" /></a>
  <a href="https://n-a-68.betteruptime.com/"><img src="https://n-a-68.betteruptime.com/badge.svg" alt="Better Stack status" /></a>
</p>

A single-purpose, auditable disposable-email platform. Create an alias for each service, forward incoming mail to a primary inbox, and identify unexpected senders.

Postern stores message headers only, never bodies. New senders are flagged for review so they can be approved or blocked, and aliases can be replaced or retired without exposing the real destination address.

**Live site:** [3xyz.uk](https://3xyz.uk) · **Status page:** [Better Stack](https://n-a-68.betteruptime.com/) · **Code quality:** [SonarCloud](https://sonarcloud.io/summary/new_code?id=Zelamene_Postern)

## Project documentation

- [Architecture decisions (ADRs)](docs/ADR.md)
- [Architecture diagram](docs/Diagrams/Postern%20Architecuture%20Diagram.jpg)
- [NFR evidence](docs/nfr/README.md)

## Built with

<p align="center">
  <a href="https://react.dev/"><img src="https://cdn.simpleicons.org/react/61DAFB" alt="React" width="28" height="28" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://cdn.simpleicons.org/typescript/3178C6" alt="TypeScript" width="28" height="28" /></a>
  <a href="https://vite.dev/"><img src="https://cdn.simpleicons.org/vite/646CFF" alt="Vite" width="28" height="28" /></a>
  <a href="https://tailwindcss.com/"><img src="https://cdn.simpleicons.org/tailwindcss/06B6D4" alt="Tailwind CSS" width="28" height="28" /></a>
  <a href="https://dotnet.microsoft.com/"><img src="https://cdn.simpleicons.org/dotnet/512BD4" alt=".NET" width="28" height="28" /></a>
  <a href="https://www.postgresql.org/"><img src="https://cdn.simpleicons.org/postgresql/4169E1" alt="PostgreSQL" width="28" height="28" /></a>
  <a href="https://developers.cloudflare.com/workers/"><img src="https://cdn.simpleicons.org/cloudflareworkers/F68222" alt="Cloudflare Workers" width="28" height="28" /></a>
  <a href="https://www.docker.com/"><img src="https://cdn.simpleicons.org/docker/2496ED" alt="Docker" width="28" height="28" /></a>
  <a href="https://github.com/features/actions"><img src="https://cdn.simpleicons.org/githubactions/2088FF" alt="GitHub Actions" width="28" height="28" /></a>
</p>

<p align="center"><sub>React · TypeScript · Vite · Tailwind CSS · .NET / ASP.NET Core · PostgreSQL · Cloudflare Workers · Docker · GitHub Actions</sub></p>

## Local development

### Prerequisites

- Docker Desktop with Docker Compose
- Node.js 24 and npm 11 (for running the frontend tools directly)
- .NET 10 SDK (for running the backend and tests directly)
