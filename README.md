# Vaccinatie-levering

Digital platform for vaccine ordering and delivery route management. Apothekers
place vaccine orders within daily and weekly limits; administrators manage stock,
orders, and route templates; bezorgers execute delivery routes on mobile-first
screens.

## Current status

**Phase 4 — Firebase authentication foundation complete.** The PWA supports
Firebase email/password registration, login, logout, and password reset. Apollo
attaches Firebase ID tokens as Bearer credentials. The API verifies tokens with
Firebase Admin and exposes a protected `currentFirebaseUser` query. Application
User records and role authorization begin in Phase 5.

## Planned stack

| Layer    | Technology                                        |
| -------- | ------------------------------------------------- |
| Monorepo | npm workspaces                                    |
| API      | NestJS, code-first GraphQL, MongoDB via TypeORM   |
| Frontend | Vue 3, Vite, Nuxt UI, Apollo Client               |
| Types    | GraphQL Code Generator → `@vaccin-delivery/types` |
| Auth     | Firebase (client + Admin SDK) — Phase 4 complete  |
| Realtime | GraphQL subscriptions (`graphql-ws`) — Phase 8+   |
| Testing  | Jest, Supertest, Playwright                       |
| Ops      | Docker Compose, GitHub Actions                    |

## Workspace packages

| Package                  | Path             | Purpose                           |
| ------------------------ | ---------------- | --------------------------------- |
| `@vaccin-delivery/api`   | `packages/api`   | GraphQL API (Phase 1 complete)    |
| `@vaccin-delivery/pwa`   | `packages/pwa`   | Vue PWA (Phase 2 complete)        |
| `@vaccin-delivery/types` | `packages/types` | Generated GraphQL types (Phase 3) |

## Package manager

**npm only.** Use `package-lock.json` at the repository root. Do not add Bun,
Lerna, or alternate lockfiles.

## GraphQL type generation

Generated artifacts are **not committed** (see `.gitignore`):

| Output       | Path                             |
| ------------ | -------------------------------- |
| API schema   | `packages/api/dist/schema.gql`   |
| Shared types | `packages/types/dist/graphql.ts` |

### Commands

```bash
npm run generate:schema   # build API + emit schema.gql (no MongoDB required)
npm run generate:types    # run GraphQL Code Generator
npm run generate:graphql  # schema + types (run both)
```

### Clean clone workflow

After `npm install`, generate types before PWA typecheck or build:

```bash
npm run generate:graphql
npm run typecheck:pwa
npm run build:pwa
```

Root `typecheck:pwa` and `build:pwa` run `generate:graphql` automatically.

PWA GraphQL documents live in `packages/pwa/src/assets/graphql/`. Import
generated types from `@vaccin-delivery/types` — do not hand-write response types.

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
npm run generate:graphql
```

## Environment setup

**PWA** (`packages/pwa/.env` — public browser configuration, safe to expose in
the client bundle):

```bash
cp packages/pwa/.env.example packages/pwa/.env
```

**API** (includes private Admin credential path):

```bash
cp packages/api/.env.example packages/api/.env
```

## Firebase setup (Phase 4)

Firebase provides two separate configuration surfaces:

| Surface         | Where                                           | Purpose              |
| --------------- | ----------------------------------------------- | -------------------- |
| Web app config  | `packages/pwa/.env` (`VITE_FIREBASE_*`)         | Browser SDK (public) |
| Service account | File on disk + `GOOGLE_APPLICATION_CREDENTIALS` | Admin SDK (private)  |

### 1. Create or select a Firebase project

Use the [Firebase console](https://console.firebase.google.com/).

### 2. Enable Authentication

Open **Build → Authentication → Sign-in method** and enable **Email/Password**.

### 3. Register a Web app

In **Project settings → Your apps**, add a Web app and copy the SDK config.

### 4. Configure the PWA

Paste the values into `packages/pwa/.env`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

These are **not secrets** — they identify your Firebase project to the browser
SDK.

### 5. Generate a Firebase Admin service account

In **Project settings → Service accounts**, click **Generate new private key**.
Save the JSON file **outside Git** (for example `~/secrets/firebase-service-account.json`).

Use `firebase-service-account.json.example` as a structural reference only.

### 6. Configure the API

Set the absolute path in `packages/api/.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/firebase-service-account.json
```

Never commit the service-account JSON file.

### 7. Authorized domains

Ensure `localhost` appears under **Authentication → Settings → Authorized
domains** for local development.

### 8. Run the application

```bash
docker compose -f infrastructure/docker-compose-dev.yml up -d
npm run dev
```

Verify:

- Register and login at http://localhost:5173/auth/login
- Admin dashboard shows `currentFirebaseUser` when authenticated
- GraphQL `health` works without a token
- GraphQL `currentFirebaseUser` requires `Authorization: Bearer <token>`

Role-based redirects and MongoDB `User` creation are **Phase 5**.

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

| Route                   | Purpose                      |
| ----------------------- | ---------------------------- |
| `/auth/login`           | Firebase login               |
| `/auth/register`        | Firebase registration        |
| `/auth/forgot-password` | Password reset request       |
| `/apotheker`            | Apotheker dashboard          |
| `/admin`                | Admin dashboard + API health |
| `/bezorger`             | Bezorger dashboard           |
| `/forbidden`            | Permission denied page       |
| unknown paths           | 404 page                     |

The admin dashboard uses generated `HealthDocument` / `HealthQuery` and
`CurrentFirebaseUserDocument` types from `@vaccin-delivery/types`.

## API commands

```bash
npm run dev:api
npm run build:api
npm run lint:api
npm run typecheck:api
npm run test:api
npm run generate:schema
```

## PWA commands

```bash
npm run dev:pwa
npm run build:pwa
npm run lint:pwa
npm run typecheck:pwa
```

## Types commands

```bash
npm run generate:types
```

## Root commands

```bash
npm run dev
npm run generate:graphql
npm run format
npm run format:check
```

## CI

- `.github/workflows/ci-api.yml` — API lint, typecheck, test, build
- `.github/workflows/ci-pwa.yml` — schema generation, type generation, PWA lint, typecheck, build

## Next phase

**Phase 5 — Application User and roles** (`docs/implementation-roadmap.md`).
MongoDB `User` entity, `createOwnUser`, role guards, and role-based redirects.
