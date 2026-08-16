# Vaccinatie-levering

Realtime progressive web app for **vaccine ordering** and **courier delivery**.

Pharmacies order vaccines within daily and weekly limits. Admins manage stock, orders, and delivery planning. Couriers run assigned routes on a mobile-first client and confirm deliveries with secure QR codes. Relevant users get live updates over GraphQL subscriptions.

**Public demo**

| Layer  | URL                                                  |
| ------ | ---------------------------------------------------- |
| PWA    | https://maciejafsdvaccin.web.app                     |
| API    | https://afsdvaccins-production.up.railway.app        |
| Health | https://afsdvaccins-production.up.railway.app/health |

---

## What it does

```text
Apotheker  →  places an order (same-day or next-day by closing time)
Admin      →  manages stock & orders, templates, generates daily routes
Bezorger   →  runs today’s route, marks arrival, confirms delivery via QR
System     →  updates stock / order status / notifications in realtime
```

| Role          | Typical work                                                        |
| ------------- | ------------------------------------------------------------------- |
| **ADMIN**     | Catalogue, stock, all orders, route templates & planning, analytics |
| **APOTHEKER** | Browse vaccines, place/cancel own orders, history, show stop QR     |
| **BEZORGER**  | Today’s route, tomorrow preview, arrival, QR confirm, voice reports |

Authorization is enforced on the **API** (Firebase ID token + role/ownership). The PWA only hides screens; the server is authoritative.

---

## Stack

```text
Vue 3 PWA (Vite, Apollo, vue-i18n, Workbox)
        │  GraphQL HTTP + graphql-ws (+ selected REST)
        ▼
NestJS API
        │
MongoDB · Firebase Auth · Azure (Blob / Vision / Speech) · Web Push
```

| Package                | Role                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `packages/api`         | NestJS GraphQL/REST API, seed / reset / bootstrap CLIs         |
| `packages/pwa`         | Vue 3 PWA                                                      |
| `packages/types`       | Generated GraphQL TypeScript types                             |
| `packages/i18n-export` | Dev-only Sheet → locale JSON exporter                          |
| `infrastructure/`      | Docker Compose + safety tests                                  |
| `tests/`               | Playwright browser E2E                                         |
| `docs/`                | `project-fiche.md`, `project-architecture.md`, `deployment.md` |

---

## Prerequisites

- **Node.js** `>= 22.16.0` (see `.nvmrc`)
- **npm** `>= 10`
- **Docker Desktop** (local Mongo)
- A **Firebase** project with Email/Password auth, web app config, and an Admin **service-account JSON**
- Optional locally: Azure / Web Push (fake providers work for most local demos)

---

## Quick start (after cloning)

From the repository root:

### 1. Install

```bash
npm install
```

### 2. Environment files

```bash
cp packages/pwa/.env.example packages/pwa/.env
cp packages/api/.env.example packages/api/.env
```

**PWA** (`packages/pwa/.env`) — public Firebase web config + API URLs:

```env
VITE_BACKEND_URL=http://localhost:3000/graphql
VITE_BACKEND_WS_URL=ws://localhost:3000/graphql
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

**API** (`packages/api/.env`) — minimum for local demo:

```env
NODE_ENV=development
PORT=3000
URL_FRONTEND=http://localhost:5173
DB_HOST=mongodb://localhost:27017
DB_NAME=vaccin-delivery

# Absolute path to your Firebase Admin service-account JSON (not committed)
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/firebase-service-account.json

# Required (≥32 characters). Example generator:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
DELIVERY_QR_SIGNING_SECRET=replace-with-at-least-32-random-chars

# Local seed / reset (CLI only — never leave these on a long-running production API)
ALLOW_DATABASE_SEED=true
ALLOW_DATABASE_RESET=true
CONFIRM_DATABASE_RESET=RESET_LOCAL_DEMO_DATABASE
SEED_DEMO_PASSWORD=your-demo-password
SEED_TEACHER_ADMIN_PASSWORD=your-teacher-password
SEED_PERSONAL_ADMIN_EMAIL=you@example.com
```

Notes:

- Store the service-account JSON **outside** Git. Copy from `firebase-service-account.json.example` only as a shape reference.
- In Firebase Console → Authentication → Authorized domains, allow **`localhost`**.
- Local image/voice features default to **fake** Azure providers unless you configure real Azure keys.
- Web Push defaults to **fake** locally; production needs real VAPID keys (see `.env.example`).

### 3. Start MongoDB

```bash
docker compose -f infrastructure/docker-compose-dev.yml up -d
```

### 4. Reset + seed demo data

```bash
npm run reset:database:demo
npm run seed:database:all
```

| Command               | Effect                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `reset:database:demo` | Drops the **local** app DB `vaccin-delivery` only. Does **not** delete Firebase Auth users.                              |
| `seed:database:all`   | Creates/reuses Firebase users and fills Mongo with deterministic demo data (vaccines, orders, bezorger1 today route, …). |

`npm run bootstrap:database:demo` is a **separate** one-off for public/Atlas demo init — not part of normal local startup. See [`docs/deployment.md`](docs/deployment.md).

### 5. Run the app

```bash
npm run dev
```

| Service            | URL                           |
| ------------------ | ----------------------------- |
| PWA                | http://localhost:5173         |
| API                | http://localhost:3000         |
| GraphQL / GraphiQL | http://localhost:3000/graphql |
| Health             | http://localhost:3000/health  |

Optional after a clean clone (also runs automatically from several typecheck/build scripts):

```bash
npm run generate:graphql
```

---

## Demo accounts (after seed)

| Email                            | Role      | Password                               |
| -------------------------------- | --------- | -------------------------------------- |
| `docent@howest.be`               | ADMIN     | value of `SEED_TEACHER_ADMIN_PASSWORD` |
| your `SEED_PERSONAL_ADMIN_EMAIL` | ADMIN     | value of `SEED_DEMO_PASSWORD`          |
| `apotheker1@demo.be`             | APOTHEKER | `SEED_DEMO_PASSWORD`                   |
| `apotheker2@demo.be`             | APOTHEKER | `SEED_DEMO_PASSWORD`                   |
| `apotheker3@demo.be`             | APOTHEKER | `SEED_DEMO_PASSWORD`                   |
| `bezorger1@demo.be`              | BEZORGER  | `SEED_DEMO_PASSWORD`                   |
| `bezorger2@demo.be`              | BEZORGER  | `SEED_DEMO_PASSWORD`                   |

---

## Useful scripts

```bash
# Quality
npm run typecheck:api
npm run typecheck:pwa
npm run test:api
npm run test:e2e:api
npm run test:pwa
npm run test:e2e:pwa
npm run test:e2e:pwa:ui
npm run audit:i18n:check
npm run test:docker:safety

# Production-like local Compose (separate from `npm run dev`)
cp infrastructure/.env.prod.example infrastructure/.env.prod
# fill secrets + FIREBASE_CREDENTIALS_HOST_PATH + VITE_*
docker compose -f infrastructure/docker-compose-production.yml --env-file infrastructure/.env.prod up -d --build
# PWA http://localhost:8080  ·  API http://localhost:3000
```

| Suite         | Tooling                              |
| ------------- | ------------------------------------ |
| API unit      | Jest                                 |
| API E2E       | Jest + Supertest + MongoMemoryServer |
| PWA unit      | Vitest                               |
| Browser E2E   | Playwright (Chromium)                |
| Docker safety | Node test runner                     |

CI (GitHub Actions): `ci-api`, `ci-api-e2e`, `ci-pwa`, `ci-playwright`, `ci-docker-smoke`. CI verifies; it does **not** deploy Hosting or Railway.

---

## Production (summary)

| Layer      | Platform                                                          |
| ---------- | ----------------------------------------------------------------- |
| PWA        | Firebase Hosting                                                  |
| API        | Railway — **one replica** (process-local PubSub, cache, throttle) |
| Database   | MongoDB Atlas                                                     |
| Auth       | Firebase                                                          |
| Media / AI | Azure Blob, Vision, Speech                                        |

API container start command is `node dist/main.js` — no automatic seed/reset/bootstrap.

PWA production build + Hosting deploy (when you intentionally redeploy):

```bash
npm run build:pwa:production
firebase deploy --only hosting
```

Details: [`docs/deployment.md`](docs/deployment.md).

---

## Security highlights

- Firebase ID token verification (HTTP + WebSocket)
- Role and ownership checks on GraphQL/REST
- Helmet, CORS locked to `URL_FRONTEND`, validation pipe
- Rate limiting; GraphQL depth/complexity limits
- HMAC-signed delivery QR tokens (`DELIVERY_QR_SIGNING_SECRET`)
- Backend-only secrets (Admin SA, Azure, VAPID private, QR signing)
- Guarded seed / reset / bootstrap CLIs

---

## Further reading

- [`docs/project-fiche.md`](docs/project-fiche.md) — business rules
- [`docs/project-architecture.md`](docs/project-architecture.md) — as-built architecture
- [`docs/deployment.md`](docs/deployment.md) — Hosting, Railway, Atlas, bootstrap
