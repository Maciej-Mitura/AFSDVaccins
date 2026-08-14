# Vaccinatie-levering

Full-stack realtime PWA for vaccine ordering and delivery-route management.

Pharmacists (apothekers) order vaccines within daily and weekly limits. Administrators manage catalogue, stock, orders, and delivery planning. Couriers (bezorgers) execute assigned routes on a mobile-first client and confirm deliveries with secure QR codes. Order, route, and notification changes reach relevant users over GraphQL subscriptions.

---

## 1. Core workflow

```text
Apotheker  →  places vaccine order (same-day or next-day by closing time)
     ↓
Admin      →  manages stock & orders
           →  maintains route templates
           →  generates / assigns delivery routes
     ↓
Bezorger   →  follows today’s route
           →  marks stop arrival
           →  confirms delivery via secure QR scan
     ↓
System     →  updates stock, order status, notifications
           →  pushes realtime updates to relevant roles
```

Orders placed before the configured closing time are eligible for same-day delivery; later orders move to the next day. Weekly and per-type daily dose caps are enforced when the pharmacist submits an order.

---

## 2. Roles

| Role          | Who                    | Capabilities (summary)                                                                                                                           |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ADMIN**     | Backoffice / evaluator | Vaccine catalogue & images, stock, all orders, settings, route templates, route generation, courier analytics, QR/PDF tools, voice-report review |
| **APOTHEKER** | Pharmacy               | Own profile, catalogue browse, place/cancel own orders, order history, planned-delivery QR view, notifications                                   |
| **BEZORGER**  | Courier                | Own profile, today’s route & tomorrow preview, stop arrival, QR preview/confirm, route PDF, voice reports, notifications                         |

Authorization is enforced on the API (Firebase ID token + MongoDB role/ownership checks). The PWA also routes by role; server rules remain authoritative.

Public self-registration creates **APOTHEKER** or **BEZORGER** only. **ADMIN** accounts are provisioned via seed/bootstrap.

---

## 3. Main features

- **Vaccine catalogue** — admin CRUD/activation; pharmacists see active vaccines
- **Stock management** — admin adjustments with audit history; low-stock awareness; stock decremented on delivered confirmation
- **Ordering** — daily/weekly limits, closing-time delivery date, order history and status
- **Realtime updates** — GraphQL subscriptions for orders, admin operations feed, notifications, courier route updates, voice-report updates
- **Route templates & planning** — fixed pharmacy stop sequences; generate daily routes; skip pharmacies without orders
- **Courier route UI** — today route, tomorrow preview, stop details
- **Secure QR delivery confirmation** — HMAC-signed stop tokens; courier preview + confirm; replay protection
- **PDF manifests** — full-route and per-stop delivery PDFs (REST)
- **PWA / offline** — installable app, service worker, offline fallback page; IndexedDB cache for courier routes/notifications; offline queue for **stop arrival only** (QR confirm is never queued offline)
- **Web Push** — VAPID-based push (backend + service worker); in-app notification centre
- **Coarse courier location** — derived city/context from route stop data (no GPS tracking)
- **Admin courier analytics** — performance views and CSV export
- **Vaccine images** — admin upload; Azure Blob storage + Azure Vision analysis (local/dev can use fake providers)
- **Voice delivery reports** — courier audio upload; Azure Speech transcription; admin/courier review
- **Internationalization** — `nl` (default), `en`, `zh`, `es`
- **Responsive UI** — shared shell with mobile navigation; courier flows oriented for phone use

---

## 4. Architecture

```text
Browser / PWA
    ↓
Vue 3 + Apollo Client (+ graphql-ws)
    ↓
GraphQL / REST / WebSocket  (/graphql)
    ↓
NestJS API
    ↓
MongoDB · Firebase Auth · Azure (Blob / Vision / Speech) · Web Push
```

| Layer            | Technology                                                                             |
| ---------------- | -------------------------------------------------------------------------------------- |
| Frontend         | Vue 3, Vite, TypeScript, Nuxt UI, Apollo Client, vue-i18n, Workbox (`vite-plugin-pwa`) |
| API              | NestJS, code-first GraphQL, selected REST endpoints                                    |
| Database         | MongoDB via TypeORM                                                                    |
| Authentication   | Firebase Authentication (client) + Firebase Admin (API token verify)                   |
| Realtime         | GraphQL subscriptions over `graphql-ws`; in-process PubSub                             |
| Cloud (deployed) | Firebase Hosting (PWA), Railway (API), MongoDB Atlas, Azure services above             |
| Monorepo         | npm workspaces                                                                         |

Shared GraphQL types are generated into `@vaccin-delivery/types` (not committed; produced by `npm run generate:graphql`).

---

## 5. Repository structure

| Path                   | Purpose                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `packages/api`         | NestJS GraphQL/REST API, seed/reset/bootstrap CLIs                           |
| `packages/pwa`         | Vue 3 progressive web app                                                    |
| `packages/types`       | Generated GraphQL TypeScript types                                           |
| `packages/i18n-export` | Dev-only Google Sheet → locale JSON exporter                                 |
| `infrastructure/`      | Docker Compose (dev Mongo + local production-like stack) and readiness tests |
| `docs/`                | Assignment, deployment, and presentation documentation                       |
| `.github/workflows/`   | CI for API, API E2E, PWA, Playwright, Docker smoke                           |
| `tests/`               | Playwright browser E2E specs                                                 |

---

## 6. Prerequisites

Derived from this repository:

- **Node.js** `>=22.16.0` (`.nvmrc` / `package.json` engines: **22.16.0**)
- **npm** `>=10.0.0`
- **Docker Desktop** (recommended for local Mongo; required for Compose presentation stack)
- **Firebase project** with Email/Password auth, web app config, and Admin service-account JSON
- **MongoDB** — local via Compose, or Atlas for cloud
- **Azure** (optional locally with fake providers; required for real image/voice features in production): Blob Storage, Vision, Speech
- For push in production: VAPID key pair (`web-push`)

---

## 7. Local setup

### Install

```bash
npm install
```

Root `typecheck:pwa` / `build:pwa` run GraphQL generation automatically when needed. After a clean clone you can also run:

```bash
npm run generate:graphql
```

### Environment files

```bash
cp packages/pwa/.env.example packages/pwa/.env
cp packages/api/.env.example packages/api/.env
```

Do **not** commit real secrets. Categories of variables:

| Surface            | Examples                                                                                 | Notes                                                        |
| ------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| PWA (public)       | `VITE_BACKEND_URL`, `VITE_BACKEND_WS_URL`, `VITE_FIREBASE_*`, optional `VITE_WEB_PUSH_*` | Safe in the browser bundle                                   |
| API core           | `PORT`, `URL_FRONTEND`, `DB_HOST`, `DB_NAME`, `NODE_ENV`                                 | Local defaults: API `3000`, PWA `5173`, DB `vaccin-delivery` |
| Firebase Admin     | `GOOGLE_APPLICATION_CREDENTIALS` (local file path)                                       | Railway uses `FIREBASE_SERVICE_ACCOUNT_JSON` instead         |
| Seed / reset gates | `ALLOW_DATABASE_SEED`, `ALLOW_DATABASE_RESET`, confirmation phrases, `SEED_*`            | Never enable on the long-running API process                 |
| Security           | `DELIVERY_QR_SIGNING_SECRET` (≥32 chars), throttle/cache/GraphQL limits                  | Backend-only                                                 |
| Azure / push       | storage, Vision, Speech, VAPID private key                                               | Backend-only; local may use `fake` providers                 |

Point `GOOGLE_APPLICATION_CREDENTIALS` at a service-account JSON file stored **outside** Git. Ensure `localhost` is an authorized Firebase Auth domain for local login.

### Start MongoDB

```bash
docker compose -f infrastructure/docker-compose-dev.yml up -d
```

### Start the app

```bash
npm run dev
```

This runs API (`nest start --watch`) and PWA (`vite`) together.

| Service | URL                           |
| ------- | ----------------------------- |
| PWA     | http://localhost:5173         |
| API     | http://localhost:3000         |
| GraphQL | http://localhost:3000/graphql |
| Health  | http://localhost:3000/health  |

---

## 8. Database seeding and demo reset

Local presentation flow (after `.env` and Mongo are ready):

```bash
npm run reset:database:demo
npm run seed:database:all
npm run dev
```

| Command                           | Effect                                                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run reset:database:demo`     | Drops **only** the guarded local application database (`DB_NAME=vaccin-delivery` on an allowed local Mongo host). **Does not** delete Firebase Authentication users. |
| `npm run seed:database:all`       | Idempotent demo seed: Firebase identities (create-or-reuse) + Mongo domain data                                                                                      |
| `npm run bootstrap:database:demo` | Separate **one-off** public/demo bootstrap (not used for normal local reset→seed)                                                                                    |

### Safety variables (placeholders only)

**Reset** (`packages/api/.env`):

```env
NODE_ENV=development
ALLOW_DATABASE_RESET=true
CONFIRM_DATABASE_RESET=RESET_LOCAL_DEMO_DATABASE
DB_HOST=mongodb://localhost:27017
DB_NAME=vaccin-delivery
```

**Seed**:

```env
NODE_ENV=development
ALLOW_DATABASE_SEED=true
SEED_DEMO_PASSWORD=your-demo-password
SEED_TEACHER_ADMIN_PASSWORD=your-teacher-password
SEED_PERSONAL_ADMIN_EMAIL=you@example.com
```

Unset or keep `ALLOW_DATABASE_SEED` / `ALLOW_DATABASE_RESET` false on any long-running API, Docker API `CMD`, or Railway service.

### Demo accounts

| Email                                | Role              | Password source               |
| ------------------------------------ | ----------------- | ----------------------------- |
| `docent@howest.be`                   | ADMIN (evaluator) | `SEED_TEACHER_ADMIN_PASSWORD` |
| value of `SEED_PERSONAL_ADMIN_EMAIL` | ADMIN             | `SEED_DEMO_PASSWORD`          |
| `apotheker1@demo.be`                 | APOTHEKER         | `SEED_DEMO_PASSWORD`          |
| `apotheker2@demo.be`                 | APOTHEKER         | `SEED_DEMO_PASSWORD`          |
| `apotheker3@demo.be`                 | APOTHEKER         | `SEED_DEMO_PASSWORD`          |
| `bezorger1@demo.be`                  | BEZORGER          | `SEED_DEMO_PASSWORD`          |
| `bezorger2@demo.be`                  | BEZORGER          | `SEED_DEMO_PASSWORD`          |

Missing Firebase users for these emails are created by the seed; existing users are reused.

---

## 9. Testing

Useful root scripts (verified against `package.json`):

```bash
npm run typecheck:api
npm run typecheck:pwa
npm run test:api
npm run test:e2e:api
npm run test:pwa
npm run test:e2e:pwa
npm run test:e2e:pwa:ui
npm run audit:i18n:check
npm run validate:production-readiness
npm run test:docker:safety
```

| Suite          | Tooling                              | What it covers                                   |
| -------------- | ------------------------------------ | ------------------------------------------------ |
| API unit       | Jest                                 | Domain services, guards, helpers                 |
| API E2E        | Jest + Supertest + MongoMemoryServer | Full Nest app: GraphQL/REST, authz, QR, security |
| PWA unit       | Vitest                               | Composables, offline IndexedDB, UI logic         |
| Browser E2E    | Playwright                           | Real browser against built PWA + test API        |
| Infrastructure | Node test runner                     | Docker/Hosting production-readiness invariants   |

CI workflows: `ci-api`, `ci-api-e2e`, `ci-pwa`, `ci-playwright`, `ci-docker-smoke`.

For a focused demo of strong tests, see [`docs/presentation-test-showcase.md`](docs/presentation-test-showcase.md).

---

## 10. Docker

| File                                           | Role                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `infrastructure/docker-compose-dev.yml`        | Local MongoDB only (`localhost:27017`)                           |
| `infrastructure/docker-compose-production.yml` | Local production-like stack: Mongo + API + PWA (nginx)           |
| `packages/api/Dockerfile`                      | API image; `CMD` is `node dist/main.js` (no seed/reset on start) |
| `packages/pwa/Dockerfile`                      | Static PWA build served via nginx                                |

Local presentation Compose example:

```bash
cp infrastructure/.env.prod.example infrastructure/.env.prod
# configure FIREBASE_CREDENTIALS_HOST_PATH, secrets, and VITE_* values
docker compose -f infrastructure/docker-compose-production.yml --env-file infrastructure/.env.prod up -d --build
```

Defaults: PWA http://localhost:8080 , API http://localhost:3000 .

`npm run test:docker:safety` checks important Docker/production safety invariants.

---

## 11. Deployment

Current public stack:

| Layer             | Platform                                            | URL                                           |
| ----------------- | --------------------------------------------------- | --------------------------------------------- |
| PWA               | Firebase Hosting                                    | https://maciejafsdvaccin.web.app              |
| API               | Railway (single replica; serverless/sleep disabled) | https://afsdvaccins-production.up.railway.app |
| GraphQL HTTP / WS | Railway `/graphql`                                  | HTTPS + WSS on the API host                   |
| Database          | MongoDB Atlas                                       | configured via Railway `DB_HOST` / `DB_NAME`  |
| Media / AI        | Azure Blob, Vision, Speech                          | API-only credentials                          |

Railway runs the normal API entry point (`node dist/main.js`). It does **not** automatically seed, reset, or bootstrap the database.

Production/demo data bootstrap is a **guarded manual** one-off:

```bash
npm run bootstrap:database:demo
```

Requires `ALLOW_DATABASE_BOOTSTRAP=true` and `CONFIRM_DATABASE_BOOTSTRAP=BOOTSTRAP_PUBLIC_DEMO_DATABASE`, plus seed password/email variables. Remove those gates after a successful run.

Full runbook: [`docs/deployment.md`](docs/deployment.md).

---

## 12. Security

Implemented measures (from source):

- Firebase ID token verification (HTTP Bearer + WebSocket connection auth)
- Role and ownership authorization on GraphQL/REST resolvers and controllers
- Helmet security headers; CORS locked to `URL_FRONTEND`
- Global validation pipe (whitelist / forbid non-whitelisted)
- Rate limiting (default + stricter limits on sensitive REST paths)
- GraphQL query depth and complexity limits
- Request body size limit
- HMAC-signed delivery QR tokens (`DELIVERY_QR_SIGNING_SECRET`)
- Secret/environment separation (no private keys in the PWA)
- Guarded database seed, local reset, and public bootstrap CLIs
- Azure, VAPID private, and QR signing secrets stay backend-only
- Production rejects fake Azure/push providers and E2E auth bypass

---

## 13. Realtime / PWA

**Realtime**

- Apollo Client splits HTTP queries/mutations and WebSocket subscriptions (`graphql-ws`)
- NestJS publishes domain events through in-process PubSub
- Subscriptions include order create/update, admin operations feed, in-app notifications, courier route updates, and voice-report updates
- Single API replica is required so PubSub, cache, and throttling stay consistent

**PWA**

- `vite-plugin-pwa` with Workbox `injectManifest` (`packages/pwa/src/sw.ts`)
- Installable standalone app; precached assets; navigation fallback to `/offline.html`
- IndexedDB offline store for courier routes and notifications
- Queued offline **stop arrival** with later sync; delivery QR confirmation remains online-only
- Optional Web Push via service worker + VAPID

---

## 14. Internationalization

```text
Google Sheet (source of truth)
    →  npm run export:i18n  (packages/i18n-export)
    →  packages/pwa/src/locales/{nl,en,zh,es}.json
    →  vue-i18n at runtime
```

Supported locales: **nl** (default), **en** (fallback), **zh**, **es**. Locale preference is stored under `vaccin-delivery:locale`. The PWA never talks to Google Sheets at runtime.

Related scripts: `npm run export:i18n`, `npm run audit:i18n:check`, `npm run sync:i18n:keys`.

---

## 15. Documentation

Useful current docs in this repository:

- [`docs/project-fiche.md`](docs/project-fiche.md) — business rules and roles
- [`docs/description.md`](docs/description.md) — assignment context
- [`docs/deployment.md`](docs/deployment.md) — public deploy runbook (Hosting + Railway + Atlas)
- [`docs/presentation-test-showcase.md`](docs/presentation-test-showcase.md) — recommended tests to demonstrate
- [`docs/requirements-matrix.md`](docs/requirements-matrix.md) — requirement traceability
