# Vaccinatie-levering

Digital platform for vaccine ordering and delivery route management. Apothekers
place vaccine orders within daily and weekly limits; administrators manage stock,
orders, and route templates; bezorgers execute delivery routes on mobile-first
screens.

## Current status

**Phase 0 — repository foundation only.** This monorepo contains workspace
boundaries, tooling, and approved design documents. No application framework
(NestJS, Vue, Firebase, MongoDB, Docker, or domain code) has been initialized
yet.

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
| `@vaccin-delivery/api`   | `packages/api`   | GraphQL API (Phase 1+)            |
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

## Available commands (Phase 0)

```bash
npm install          # install root devDependencies (Prettier)
npm run format       # format JSON and Markdown files
npm run format:check # verify formatting
npm run workspaces   # inspect workspace configuration
npm run workspaces:list
```

Application commands (`dev`, `build`, `test`, seed, Docker) will be added in
later roadmap phases.

## Next phase

**Phase 1 — NestJS API foundation** (`docs/implementation-roadmap.md`).
