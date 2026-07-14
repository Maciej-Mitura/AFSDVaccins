# Vaccinatie-levering

Digital platform for vaccine ordering and delivery route management. Apothekers
place vaccine orders within daily and weekly limits; administrators manage stock,
orders, and route templates; bezorgers execute delivery routes on mobile-first
screens.

## Current status

**Phase 1 — API foundation complete.** The NestJS GraphQL API runs with MongoDB
via TypeORM, environment validation, and a public health check. The PWA has not
been initialized yet.

## Planned stack

| Layer    | Technology                                      |
| -------- | ----------------------------------------------- |
| Monorepo | npm workspaces                                  |
| API      | NestJS, code-first GraphQL, MongoDB via TypeORM |
| Frontend | Vue 3, Vite, Nuxt UI, Apollo Client             |
| Auth     | Firebase (client + Admin SDK)                   |
| Realtime | GraphQL subscriptions (`graphql-ws`)            |
| Testing  | Jest, Supertest, Playwright                     |
| Ops      | Docker Compose, GitHub Actions                  |

## Workspace packages

| Package                  | Path             | Purpose                           |
| ------------------------ | ---------------- | --------------------------------- |
| `@vaccin-delivery/api`   | `packages/api`   | GraphQL API (Phase 1 complete)    |
| `@vaccin-delivery/pwa`   | `packages/pwa`   | Vue PWA (Phase 2+)                |
| `@vaccin-delivery/types` | `packages/types` | Shared generated types (Phase 3+) |

## Package manager

**npm only.** Use `package-lock.json` at the repository root. Do not add Bun,
Lerna, or alternate lockfiles.

## Source-of-truth documents

Approved project documentation lives in `docs/`:

- `project-fiche.md` — business rules and roles
- `project-fiche-analysis.md` — fiche analysis
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

## API setup

1. Copy the environment template:

   ```bash
   cp packages/api/.env.example packages/api/.env
   ```

2. Start MongoDB (choose one option):

   **Option A — Docker Compose (recommended for development):**

   ```bash
   docker compose -f infrastructure/docker-compose-dev.yml up -d
   ```

   **Option B — existing local MongoDB** on `mongodb://localhost:27017`.

3. Start the API:

   ```bash
   npm run dev:api
   ```

## API endpoints

| Resource           | URL                           |
| ------------------ | ----------------------------- |
| GraphQL / GraphiQL | http://localhost:3000/graphql |
| REST health        | http://localhost:3000/health  |

### Health GraphQL query

```graphql
query {
  health {
    status
    service
    timestamp
    environment
  }
}
```

## API commands

```bash
npm run dev:api        # start API in watch mode
npm run build:api      # compile API
npm run lint:api       # ESLint
npm run typecheck:api  # TypeScript check
npm run test:api       # Jest unit tests
```

## Root commands

```bash
npm run format         # format JSON and Markdown files
npm run format:check   # verify formatting
npm run workspaces     # inspect workspace configuration
```

## CI

`.github/workflows/ci-api.yml` runs lint, typecheck, test, and build for the API
package on pushes and pull requests to `main` and `develop`.

## Next phase

**Phase 2 — Vue PWA foundation** (`docs/implementation-roadmap.md`).
