# Project Architecture — Vaccinatie-levering (as-built)

Technical architecture of the final Vaccinatie-levering system: a full-stack
realtime PWA for vaccine ordering, stock, route planning, and courier delivery.

Related ops docs: root `README.md`, `docs/deployment.md`,
`docs/requirements-matrix.md`, `docs/project-fiche.md`.

---

## 1. High-level architecture

```text
Firebase Hosting
      │
      ▼
Vue 3 PWA (Vite, Nuxt UI, Apollo, vue-i18n, Workbox)
      │
 GraphQL HTTP + graphql-ws  +  selected REST
      │
      ▼
Railway — NestJS API (single replica)
   │          │          │          │
MongoDB    Firebase    Azure     Web Push
 Atlas      Admin    Blob/Vision/  (VAPID)
                      Speech
```

| Layer            | Technology                                                            |
| ---------------- | --------------------------------------------------------------------- |
| Monorepo         | npm workspaces (`packages/*`)                                         |
| Frontend         | Vue 3, Vite, TypeScript, Composition API, Nuxt UI, Apollo Client      |
| Shared types     | GraphQL Code Generator → `@vaccin-delivery/types`                     |
| API              | NestJS, code-first GraphQL, limited REST                              |
| Database         | MongoDB via TypeORM                                                   |
| Auth             | Firebase Authentication (client) + Firebase Admin (API)               |
| Realtime         | GraphQL subscriptions (`graphql-ws`), in-process PubSub               |
| PWA              | `vite-plugin-pwa` / Workbox `injectManifest`, IndexedDB offline layer |
| Push             | Web Push + VAPID                                                      |
| Cloud AI / media | Azure Blob, Vision, Speech                                            |
| Public deploy    | Firebase Hosting + Railway + MongoDB Atlas                            |
| Local ops        | Docker Compose (dev Mongo; production-like full stack)                |

---

## 2. Repository structure

| Path                   | Role                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `packages/api`         | NestJS GraphQL/REST API, seed/reset/bootstrap CLIs           |
| `packages/pwa`         | Installable Vue PWA (all roles)                              |
| `packages/types`       | Generated GraphQL TypeScript types (gitignored build output) |
| `packages/i18n-export` | Dev-only Google Sheet → locale JSON exporter                 |
| `infrastructure/`      | Compose files, readiness / Docker safety tests               |
| `tests/`               | Playwright browser E2E                                       |
| `.github/workflows/`   | CI validation (no production CD jobs)                        |
| `docs/`                | Assignment, deployment, and as-built technical docs          |

---

## 3. Frontend architecture

- **One PWA**, three role route groups: `/admin/*`, `/apotheker/*`, `/bezorger/*`, plus `/auth/*`
- Router guards use Firebase session + application role; **API authorization remains authoritative**
- Views → feature/common components → composables → Apollo Client
- Apollo splits **HTTP** queries/mutations and **WebSocket** subscriptions (`useGraphQL.ts`)
- Forms use Zod + Nuxt UI patterns where implemented
- Runtime i18n via `vue-i18n` (see `docs/i18n-audit.md`)

### Request flow

```text
Vue view / feature component
    → composable (Apollo useQuery / useMutation / useSubscription)
    → GraphQL over HTTP or graphql-ws
    → Nest resolver (+ guards)
    → domain service
    → TypeORM / MongoDB
    → optional PubSub publish
    → PWA subscription / refetch / toast
```

Selected binary or multipart flows use **REST** instead of GraphQL (health, QR
confirm, PDF manifests, vaccine images, voice upload/audio, analytics CSV).

---

## 4. API architecture

- NestJS modules by domain (user, vaccine, stock, order, routes, notifications,
  push, analytics, …)
- Code-first GraphQL schema; GraphiQL enabled outside production
- Global `ValidationPipe`, Helmet, CORS locked to `URL_FRONTEND`
- Throttling and GraphQL depth/complexity limits
- Process-local application cache for selected reference/analytics data

### GraphQL vs REST

| GraphQL                                | REST                                                     |
| -------------------------------------- | -------------------------------------------------------- |
| Primary CRUD / queries / subscriptions | `/health`                                                |
| Role-scoped domain operations          | Delivery QR preview/confirm, stop arrival                |
|                                        | PDF manifests, vaccine image upload                      |
|                                        | Voice-report upload / audio stream / transcription retry |
|                                        | Courier analytics CSV export                             |

---

## 5. Data and persistence

- MongoDB collections via TypeORM entities (embedded stops/lines where appropriate)
- Application database selected by **`DB_NAME`** (authoritative even for Atlas URIs)
- Local: Compose Mongo; public: MongoDB Atlas
- Reproducible demo data via guarded CLI seed / bootstrap — **not** on API boot
  (`CMD` is `node dist/main.js`)

Configurable operational policies (closing time, weekly/daily caps, timezone)
live in settings / seed, not hardcoded forever in services.

---

## 6. Authentication and authorization

| Concern   | Implementation                                                    |
| --------- | ----------------------------------------------------------------- |
| Sign-in   | Firebase email/password                                           |
| API auth  | Bearer ID token verified by Firebase Admin                        |
| App user  | Mongo `User` linked by `firebaseUid` + role                       |
| Roles     | `ADMIN`, `APOTHEKER`, `BEZORGER`                                  |
| Guards    | Authorization + roles + ownership checks on resolvers/controllers |
| WebSocket | `graphql-ws` `onConnect` authenticates Bearer                     |
| PKCE      | Not used (email/password flow; not OAuth authorization-code)      |

Public registration creates APOTHEKER/BEZORGER only. ADMIN comes from seed/bootstrap
(e.g. evaluator `docent@howest.be`).

---

## 7. Realtime

- Domain events publish through in-process `graphql-subscriptions` PubSub
- Examples: order create/update, admin operations feed, notifications, courier
  route updates, voice-report updates
- Subscriptions are filtered by role/ownership

**Operational constraint:** PubSub, cache, and throttle state are
**process-local**. Public production therefore runs **exactly one** Railway
replica with Serverless/sleep disabled so WebSockets stay connected.

---

## 8. PWA, offline, and push

| Concern               | As-built behaviour                                                              |
| --------------------- | ------------------------------------------------------------------------------- |
| Installability        | Manifest + Workbox precache; standalone display                                 |
| Navigation offline    | NetworkOnly → `/offline.html`                                                   |
| Private data cache    | IndexedDB (`vaccin-delivery-offline`), courier-scoped                           |
| Offline mutations     | Only queued action: stop arrival (`COURIER_STOP_ARRIVED`)                       |
| QR / delivery / voice | Online-only                                                                     |
| Web Push              | VAPID; private key backend-only; SW suppresses OS push when a window is focused |

Details: `docs/offline-pwa.md`, `docs/notifications.md`.

---

## 9. Domain extensions (as-built)

| Feature                 | Architecture note                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| Secure QR delivery      | HMAC-signed tokens; courier confirm via REST; stock decrement on success                          |
| Coarse courier location | City from stop arrival/delivery snapshots — **no GPS** (`docs/courier-location.md`)               |
| Courier analytics       | ADMIN all-time metrics + CSV; query-time calc + short process cache (`docs/courier-analytics.md`) |
| Vaccine images          | Admin upload → Azure Blob + Vision analysis                                                       |
| Stop voice reports      | Per-stop audio → private Blob + Azure Speech (`docs/phase-36e-stop-voice-reports.md`)             |
| PDF manifests           | Authenticated binary REST downloads                                                               |

---

## 10. Deployment architecture

| Surface    | Provider                                                           |
| ---------- | ------------------------------------------------------------------ |
| PWA        | Firebase Hosting (`packages/pwa/dist`)                             |
| API        | Railway Docker image (`packages/api/Dockerfile`)                   |
| Database   | MongoDB Atlas                                                      |
| CI         | GitHub Actions (test/build/smoke only)                             |
| Hosting CD | Manual (`build:pwa:production` + `firebase deploy --only hosting`) |

Full runbook: `docs/deployment.md`.

---

## 11. Testing architecture

| Layer          | Tooling                                                            |
| -------------- | ------------------------------------------------------------------ |
| API unit       | Jest                                                               |
| API E2E        | Jest + Supertest + MongoMemoryServer                               |
| PWA unit       | Vitest                                                             |
| Browser E2E    | Playwright                                                         |
| Infrastructure | Node tests (`validate:production-readiness`, `test:docker:safety`) |

Presentation-oriented test picks: `docs/presentation-test-showcase.md`.

---

## 12. Security posture (summary)

- Firebase token verification + role/ownership authorization
- Helmet, CORS, validation, throttling, GraphQL query protection
- Backend-only secrets (Admin SA, Azure, VAPID private, QR signing)
- Guarded seed / local reset / public bootstrap CLIs
- No E2E auth bypass in production

---

## 13. Explicit non-goals (not in this architecture)

- Horizontal multi-replica realtime (would need shared PubSub/cache)
- Continuous GPS tracking / Mapbox live maps
- Automatic production seeding on container start
- Full automatic CD for Firebase Hosting via GitHub Actions
- Sentry/LogRocket, Kubernetes, Docker Hub publish (optional extras not adopted)
