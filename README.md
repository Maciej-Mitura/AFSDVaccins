# Vaccinatie-levering

Digital platform for vaccine ordering and delivery route management. Apothekers
place vaccine orders within daily and weekly limits; administrators manage stock,
orders, and route templates; bezorgers execute delivery routes on mobile-first
screens.

## Current status

**Phase 2 — PWA foundation complete.** Vue 3 + Vite frontend with Nuxt UI, role
route placeholders, Apollo HTTP client, and API health indicator. Firebase,
generated GraphQL types, and domain screens are not implemented yet.

## Planned stack

| Layer    | Technology                                      |
| -------- | ----------------------------------------------- |
| Monorepo | npm workspaces                                  |
| API      | NestJS, code-first GraphQL, MongoDB via TypeORM |
| Frontend | Vue 3, Vite, Nuxt UI, Apollo Client             |
| Auth     | Firebase (client + Admin SDK) — Phase 4+        |
| Realtime | GraphQL subscriptions (`graphql-ws`) — Phase 8+ |
| Testing  | Jest, Supertest, Playwright                     |
| Ops      | Docker Compose, GitHub Actions                  |

## Workspace packages

| Package                  | Path             | Purpose                           |
| ------------------------ | ---------------- | --------------------------------- |
| `@vaccin-delivery/api`   | `packages/api`   | GraphQL API (Phase 1 complete)    |
| `@vaccin-delivery/pwa`   | `packages/pwa`   | Vue PWA (Phase 2 complete)        |
| `@vaccin-delivery/types` | `packages/types` | Shared generated types (Phase 3+) |

## Package manager

**npm only.** Use `package-lock.json` at the repository root. Do not add Bun,
Lerna, or alternate lockfiles.

## Source-of-truth documents

Approved project documentation lives in `docs/`:

- `project-fiche.md` — business rules and roles
- `project-architecture.md` — technical architecture
- `implementation-roadmap.md` — phased build sequence
- `requirements-matrix.md` — requirement traceability
- `description.md` — official assignment and rubric

Agent rules: `AGENTS.md` at the repository root.

## Branch workflow

| Branch      | Purpose                                              |
| ----------- | ---------------------------------------------------- |
| `main`      | Stable submission and presentation branch            |
| `develop`   | Active integration branch                            |
| `feature/*` | Roadmap phase implementation (branch from `develop`) |

## Node version

Use Node **22.16.0** (Active LTS). See `.nvmrc` and `package.json` `engines`.

## Installation

From the repository root:

```bash
npm install
```

## Environment setup

**API:**

```bash
cp packages/api/.env.example packages/api/.env
```

**PWA:**

```bash
cp packages/pwa/.env.example packages/pwa/.env
```

## MongoDB

**Docker Compose (recommended):**

```bash
docker compose -f infrastructure/docker-compose-dev.yml up -d
```

**Or** use an existing MongoDB instance on `mongodb://localhost:27017`.

## Development

Start API and PWA together:

```bash
npm run dev
```

Or start them separately:

```bash
npm run dev:api
npm run dev:pwa
```

## Local URLs

| Resource           | URL                           |
| ------------------ | ----------------------------- |
| PWA (Vite)         | http://localhost:5173         |
| GraphQL / GraphiQL | http://localhost:3000/graphql |
| REST health        | http://localhost:3000/health  |

## Placeholder routes

| Route                    | Purpose                    |
| ------------------------ | -------------------------- |
| `/auth/login`            | Auth placeholder           |
| `/auth/register`         | Registration placeholder   |
| `/auth/forgot-password`  | Password reset placeholder |
| `/apotheker`             | Apotheker dashboard        |
| `/admin`                 | Admin dashboard + API health |
| `/bezorger`              | Bezorger dashboard         |
| `/forbidden`             | Permission denied page     |
| unknown paths            | 404 page                   |

The admin dashboard queries the Phase 1 `health` GraphQL field and shows
loading, success, or error states. No authentication headers are sent yet.

## API commands

```bash
npm run dev:api
npm run build:api
npm run lint:api
npm run typecheck:api
npm run test:api
```

## PWA commands

```bash
npm run dev:pwa
npm run build:pwa
npm run lint:pwa
npm run typecheck:pwa
```

## Root commands

```bash
npm run dev              # API + PWA concurrently
npm run format
npm run format:check
npm run workspaces
```

## CI

- `.github/workflows/ci-api.yml` — API lint, typecheck, test, build
- `.github/workflows/ci-pwa.yml` — PWA lint, typecheck, build

## Next phase

**Phase 3 — Shared GraphQL types** (`docs/implementation-roadmap.md`).
