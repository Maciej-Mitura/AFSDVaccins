# Deployment and operations

As-built runbook for the public Vaccinatie-levering stack and related operational
controls. Local development (`npm run dev`) is documented in the root README.

---

## 1. Production architecture

| Layer          | Provider / technology                                         |
| -------------- | ------------------------------------------------------------- |
| PWA            | Firebase Hosting (static Vite build from `packages/pwa/dist`) |
| API            | Railway — Docker image from `packages/api/Dockerfile`         |
| Database       | MongoDB Atlas (`mongodb+srv`, TLS)                            |
| Authentication | Firebase Authentication (PWA) + Firebase Admin (API)          |
| Realtime       | GraphQL subscriptions over `graphql-ws` on `/graphql`         |
| Media / AI     | Azure Blob Storage, Azure Vision, Azure Speech (API-only)     |
| Push           | Web Push (VAPID) via the API + PWA service worker             |

```text
Firebase Hosting
      |
      v
Vue PWA (Apollo HTTP + graphql-ws)
      |
 GraphQL / REST / WebSocket  (/graphql)
      |
      v
Railway NestJS API  (single replica)
   |          |          |          |
MongoDB     Firebase    Azure     Web Push
 Atlas       Admin    Blob/Vision/  (VAPID)
                       Speech
```

### Verified public URLs

| Surface | URL                                                              |
| ------- | ---------------------------------------------------------------- |
| PWA     | https://maciejafsdvaccin.web.app                                 |
| API     | https://afsdvaccins-production.up.railway.app                    |
| Health  | https://afsdvaccins-production.up.railway.app/health             |
| GraphQL | `https://…/graphql` (HTTP) and `wss://…/graphql` (subscriptions) |

GitHub Actions runs CI only (`ci-api`, `ci-api-e2e`, `ci-pwa`, `ci-playwright`,
`ci-docker-smoke`). It does **not** deploy to Railway or Firebase Hosting.

---

## 2. Railway API deployment

### What Railway runs

- **Build context:** repository root (`examMaciej/`)
- **Dockerfile:** `packages/api/Dockerfile`
- **Runtime image:** Node 22.16.0 Alpine
- **Working directory:** `/app/packages/api`
- **Start command (image default):** `node dist/main.js`

That entry point starts the NestJS HTTP/GraphQL server only. It does **not**
run seed, reset, or bootstrap CLIs (`cli.js`, `reset-cli.js`, `bootstrap-cli.js`
are not part of `CMD`).

Container healthcheck probes `GET /health` on `PORT` (default `3000`). Railway
should use the same path for its health check.

### Required Railway topology

| Setting            | Value           | Why                                                                                                                                                     |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replicas           | **exactly one** | GraphQL PubSub, application cache, and rate-limit state are **process-local**. Multiple replicas would desync realtime fans-out, caches, and throttles. |
| Serverless / sleep | **disabled**    | Subscriptions use long-lived WebSockets; a sleeping instance drops realtime clients.                                                                    |
| Persistent volume  | not required    | No local filesystem dependency for normal API operation                                                                                                 |
| Mongo on Railway   | **not used**    | Atlas only for the public stack                                                                                                                         |

Do not claim horizontal API scaling for this deployment.

### Typical Railway variables (placeholders)

```text
NODE_ENV=production
URL_FRONTEND=https://maciejafsdvaccin.web.app
DB_HOST=mongodb+srv://<user>:<password>@<cluster-host>/?retryWrites=true&w=majority
DB_NAME=vaccin-delivery-demo
TRUST_PROXY=1
FIREBASE_SERVICE_ACCOUNT_JSON=<raw JSON or base64 JSON>
```

`PORT` is injected by Railway — do not hardcode a conflicting value.

Also set production Azure, QR signing, and Web Push variables (see §8). Do **not**
leave `ALLOW_DATABASE_BOOTSTRAP` / `CONFIRM_DATABASE_BOOTSTRAP` on the
long-running service.

---

## 3. Firebase Hosting (PWA)

Hosting config: `firebase.json`

- `public`: `packages/pwa/dist`
- SPA rewrite to `/index.html`
- Cache headers for `index.html`, `sw.js`, `offline.html`, assets
- No Cloud Functions; Hosting does not proxy the API

Project selection uses a gitignored `.firebaserc` (start from
`.firebaserc.example`, which only contains `YOUR_FIREBASE_PROJECT_ID`).

### Production build and deploy

```bash
# Build-time public configuration (HTTPS + WSS required)
export VITE_BACKEND_URL='https://afsdvaccins-production.up.railway.app/graphql'
export VITE_BACKEND_WS_URL='wss://afsdvaccins-production.up.railway.app/graphql'
export VITE_FIREBASE_API_KEY='...'
export VITE_FIREBASE_AUTH_DOMAIN='...'
export VITE_FIREBASE_PROJECT_ID='...'
export VITE_FIREBASE_STORAGE_BUCKET='...'
export VITE_FIREBASE_MESSAGING_SENDER_ID='...'
export VITE_FIREBASE_APP_ID='...'
# Optional push (public key only):
# export VITE_WEB_PUSH_ENABLED=true
# export VITE_WEB_PUSH_VAPID_PUBLIC_KEY='...'
# Do NOT set VITE_E2E_AUTH_BYPASS

npm run build:pwa:production
firebase deploy --only hosting
```

`npm run build:pwa:production` validates production `VITE_*` values (HTTPS/WSS,
rejects placeholders and E2E bypass) before building.

All `VITE_*` values are **public frontend configuration** baked into the static
bundle. They are not backend secrets. Changing any `VITE_*` requires rebuild +
redeploy.

After first Hosting deploy, add the Hosting domain under Firebase Authentication
→ Authorized domains, and set Railway `URL_FRONTEND` to the **exact** PWA origin
(scheme + host) so CORS matches.

---

## 4. MongoDB Atlas

- The API connects with TypeORM Mongo options built from `DB_HOST` + **`DB_NAME`**
  (`packages/api/src/config/mongo-connection.ts`).
- **`DB_NAME` is authoritative** even when the URI path is empty or wrong.
  Example URI shape (placeholders only):

  ```text
  mongodb+srv://<user>:<password>@<cluster-host>/?retryWrites=true&w=majority
  ```

- Credentials stay in Railway secrets / local env — never in Git.
- Application collections live under the configured `DB_NAME` in Atlas.
- Normal API startup tolerates an empty database; demo/reference data comes from
  an explicit bootstrap (§9), not from container start.

---

## 5. Firebase Authentication

| Surface           | Where                                                                                 | Purpose                                                                |
| ----------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Web app config    | PWA `VITE_FIREBASE_*`                                                                 | Browser Firebase SDK (public)                                          |
| Admin credentials | Railway `FIREBASE_SERVICE_ACCOUNT_JSON` **or** local `GOOGLE_APPLICATION_CREDENTIALS` | Verify ID tokens, provision/reconcile Auth users during seed/bootstrap |

**Credential precedence on the API:**
`FIREBASE_SERVICE_ACCOUNT_JSON` → `GOOGLE_APPLICATION_CREDENTIALS` → startup
failure. A malformed env JSON does **not** fall back to the file path.

Demo/evaluator identities (e.g. `docent@howest.be`) are Firebase Auth users linked
to MongoDB application users by `firebaseUid`. Passwords are never stored in the
API database; they live only in Firebase Auth (set via seed/bootstrap env).

---

## 6. Azure (API-only)

Production rejects `fake` image/transcription providers. Credentials never appear
in the PWA or as `VITE_*` variables.

| Service                | Role                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| **Azure Blob Storage** | Private containers for vaccine catalogue images and route voice-report audio |
| **Azure Vision**       | Image analysis for vaccine catalogue uploads                                 |
| **Azure Speech**       | Fast transcription of courier voice reports                                  |

Representative Railway settings (placeholders):

```text
VACCINE_IMAGE_STORAGE_PROVIDER=azure
VACCINE_IMAGE_ANALYSIS_PROVIDER=azure
AZURE_STORAGE_CONNECTION_STRING=<storage-connection-string>
AZURE_STORAGE_CONTAINER_NAME=vaccine-images
AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER=route-voice-reports
AZURE_VISION_ENDPOINT=https://<resource-name>.cognitiveservices.azure.com
AZURE_VISION_KEY=<subscription-key>
ROUTE_VOICE_TRANSCRIPTION_PROVIDER=azure
ROUTE_VOICE_TRANSCRIPTION_ENABLED=true
AZURE_SPEECH_ENDPOINT=https://<resource-name>.cognitiveservices.azure.com
AZURE_SPEECH_KEY=<subscription-key>
```

Pre-create private Blob containers (anonymous access disabled). Changing these
variables requires an API restart/redeploy.

Local real-Azure acceptance (does not deploy): see
[`docs/phase-34d-real-azure-readiness.md`](./phase-34d-real-azure-readiness.md)
and `npm run diagnose:voice-reports:azure` / `npm run test:voice-reports:azure`.

---

## 7. Web Push (VAPID)

| Key                          | Where    | Visibility                                                         |
| ---------------------------- | -------- | ------------------------------------------------------------------ |
| `WEB_PUSH_VAPID_PUBLIC_KEY`  | API      | May also be exposed to the PWA as `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | API only | **Never** in the PWA or Git                                        |
| `WEB_PUSH_SUBJECT`           | API      | e.g. `mailto:ops@example.com`                                      |
| `PUSH_PROVIDER`              | API      | Production: `webpush` (`fake` rejected)                            |

Generate a key pair with `npx web-push generate-vapid-keys`. The public and
private keys must match across API and PWA build.

---

## 8. Environment variable reference

Placeholders only — never commit real values.

### Public frontend configuration (PWA build)

| Variable                         | Purpose                                      |
| -------------------------------- | -------------------------------------------- |
| `VITE_BACKEND_URL`               | GraphQL HTTP endpoint (production: HTTPS)    |
| `VITE_BACKEND_WS_URL`            | GraphQL WebSocket endpoint (production: WSS) |
| `VITE_FIREBASE_*`                | Firebase web app identification (public)     |
| `VITE_WEB_PUSH_ENABLED`          | Enable push UI when configured               |
| `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` | Public VAPID key for `PushManager.subscribe` |

### Backend / database (Railway)

| Variable                                 | Purpose                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `NODE_ENV`                               | Must be `production` on Railway                                                      |
| `PORT`                                   | HTTP listen port (platform-injected)                                                 |
| `URL_FRONTEND`                           | Exact PWA origin for CORS                                                            |
| `DB_HOST`                                | Atlas connection URI (secret)                                                        |
| `DB_NAME`                                | Application database name                                                            |
| `TRUST_PROXY`                            | Use `1` on Railway (one hop). Do **not** use `true` for this single-service topology |
| Throttle / cache / GraphQL / body limits | Optional overrides; defaults in `packages/api/.env.example`                          |

### Firebase Admin

| Variable                         | Purpose                                 |
| -------------------------------- | --------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_JSON`  | Railway: service-account JSON or base64 |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local/Compose: path to SA JSON file     |

### Azure

| Variable                                         | Purpose                                                 |
| ------------------------------------------------ | ------------------------------------------------------- |
| `VACCINE_IMAGE_*_PROVIDER`                       | `azure` in production                                   |
| `AZURE_STORAGE_*`                                | Blob connection, image + voice containers, read-URL TTL |
| `AZURE_VISION_*`                                 | Vision endpoint, key, timeout                           |
| `ROUTE_VOICE_TRANSCRIPTION_*` / `AZURE_SPEECH_*` | Speech transcription enablement and credentials         |

### QR security

| Variable                     | Purpose                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| `DELIVERY_QR_SIGNING_SECRET` | HMAC signing for delivery QR tokens (≥32 chars; backend-only) |

### Web Push

| Variable                     | Purpose                                |
| ---------------------------- | -------------------------------------- |
| `PUSH_PROVIDER`              | `webpush` in production                |
| `WEB_PUSH_VAPID_PUBLIC_KEY`  | Public VAPID key                       |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Private VAPID key (backend-only)       |
| `WEB_PUSH_SUBJECT`           | VAPID subject (`mailto:` or HTTPS URL) |

### Production safety controls

| Variable                     | Production rule                                       |
| ---------------------------- | ----------------------------------------------------- |
| `ALLOW_DATABASE_SEED`        | Keep `false` on Railway                               |
| `ALLOW_DATABASE_RESET`       | Keep `false` (local development only)                 |
| `ALLOW_DATABASE_BOOTSTRAP`   | Only for a one-off bootstrap process; unset afterward |
| `CONFIRM_DATABASE_BOOTSTRAP` | `BOOTSTRAP_PUBLIC_DEMO_DATABASE` during one-off only  |
| `ALLOW_E2E_AUTH_BYPASS`      | Forbidden (`NODE_ENV=test` only)                      |
| `VITE_E2E_AUTH_BYPASS`       | Forbidden in production builds / PWA Dockerfile       |

---

## 9. Seed / reset / bootstrap safety

None of these run during normal Railway API startup (`CMD ["node", "dist/main.js"]`).

| Operation                     | Command                           | When                                           | Gates (from source)                                                                                                                                                                                  |
| ----------------------------- | --------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local demo reset**          | `npm run reset:database:demo`     | Local presentation wipe of the guarded app DB  | `NODE_ENV=development`, `ALLOW_DATABASE_RESET=true`, `CONFIRM_DATABASE_RESET=RESET_LOCAL_DEMO_DATABASE`, local Mongo host + `DB_NAME=vaccin-delivery` only. **Does not** delete Firebase Auth users. |
| **Local development seed**    | `npm run seed:database:all`       | Local demo data                                | `NODE_ENV=development`, `ALLOW_DATABASE_SEED=true`, plus `SEED_DEMO_PASSWORD`, `SEED_TEACHER_ADMIN_PASSWORD`, `SEED_PERSONAL_ADMIN_EMAIL`                                                            |
| **Production/demo bootstrap** | `npm run bootstrap:database:demo` | Explicit one-off against Atlas (or equivalent) | `ALLOW_DATABASE_BOOTSTRAP=true`, `CONFIRM_DATABASE_BOOTSTRAP=BOOTSTRAP_PUBLIC_DEMO_DATABASE`, seed password/email vars, Firebase Admin + Atlas connectivity                                          |

### Production/demo bootstrap (manual, optional after first setup)

Use a trusted machine or an ephemeral Railway one-off — **not** the long-running
API process health path:

```bash
export NODE_ENV=production
export URL_FRONTEND='https://maciejafsdvaccin.web.app'
export DB_HOST='mongodb+srv://<user>:<password>@<cluster-host>/?retryWrites=true&w=majority'
export DB_NAME=vaccin-delivery-demo
export FIREBASE_SERVICE_ACCOUNT_JSON='...'
export ALLOW_DATABASE_BOOTSTRAP=true
export CONFIRM_DATABASE_BOOTSTRAP=BOOTSTRAP_PUBLIC_DEMO_DATABASE
export SEED_DEMO_PASSWORD='...'
export SEED_TEACHER_ADMIN_PASSWORD='...'
export SEED_PERSONAL_ADMIN_EMAIL='you@example.com'

npm run bootstrap:database:demo
```

Behavior:

- Uses `DB_NAME` (same connection builder as the API)
- Enables TypeORM `synchronize` **only in this CLI process** to reconcile indexes
- Idempotently creates/reuses Firebase Auth users and Mongo domain data
- Logs created/updated/skipped counts — **not** passwords

After success, **unset** bootstrap gates and seed passwords from the one-off
environment / Railway. Keep `DB_HOST`, `FIREBASE_SERVICE_ACCOUNT_JSON`,
`URL_FRONTEND`, `TRUST_PROXY`, `DB_NAME`, and Azure/push/QR secrets.

---

## 10. Redeploy ordering

Deployments are manual.

| Change type                             | Safe order                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| PWA-only (compatible GraphQL/REST)      | Build + `firebase deploy --only hosting`                                                           |
| API-only (backward-compatible contract) | Deploy Railway → verify `/health` + GraphQL/WS                                                     |
| Breaking API + PWA change               | Deploy API first → verify → rebuild PWA with matching `VITE_*` → Hosting deploy → smoke-test roles |

After Hosting domain or origin changes, update `URL_FRONTEND` and restart the API
so CORS stays aligned.

### Rollback

| Layer | Action                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------ |
| API   | Redeploy previous Railway revision                                                               |
| PWA   | Redeploy previous Hosting release / prior `dist`                                                 |
| Data  | Atlas backup/restore if available; re-run bootstrap only with gates if demo data must be rebuilt |

---

## 11. Validation and health checks

| Check                                         | How                                                               |
| --------------------------------------------- | ----------------------------------------------------------------- |
| API liveness                                  | `GET /health` → `{ "status": "ok", ... }`                         |
| GraphQL                                       | HTTPS `POST /graphql` with Firebase Bearer token                  |
| Subscriptions                                 | WSS `/graphql` (`graphql-ws`) without forcing a full page refresh |
| Offline production-readiness (no cloud calls) | `npm run validate:production-readiness`                           |
| Docker/production safety invariants           | `npm run test:docker:safety`                                      |
| Production PWA env validation                 | `npm run build:pwa:production`                                    |

CI workflows exercise unit/E2E/Playwright/Docker smoke on push; they do not deploy.

---

## 12. Operational constraints

These are intentional architecture limits of the current deployment:

- **Single Railway replica** — process-local PubSub, cache, and throttling
- **Serverless/sleep disabled** — WebSocket subscriptions must stay connected
- **No automatic production seeding** — startup is `node dist/main.js` only
- **Manual Firebase Hosting deploy** — no Actions production deploy pipeline
- **Manual production bootstrap** — gated one-off; gates must not stay on Railway
- **Azure image/voice features** require valid server-side Azure configuration
- **Web Push** requires matching VAPID keys on API and PWA build
- **`TRUST_PROXY=1`** — trust one proxy hop (Railway edge); avoid `TRUST_PROXY=true`

---

## 13. Local presentation Compose (not the public stack)

`infrastructure/docker-compose-production.yml` runs a local production-like stack
(Mongo + API + nginx PWA) with a file-mounted Firebase service account. It is
useful for demos without Railway/Atlas/Hosting, and is **not** the public
deployment path.

```bash
cp infrastructure/.env.prod.example infrastructure/.env.prod
# configure FIREBASE_CREDENTIALS_HOST_PATH, secrets, VITE_*
docker compose -f infrastructure/docker-compose-production.yml --env-file infrastructure/.env.prod up -d --build
```

Defaults: PWA http://localhost:8080 , API http://localhost:3000 .

Dev Mongo only: `infrastructure/docker-compose-dev.yml`.

---

## Related commands

```bash
npm run validate:production-readiness
npm run test:docker:safety
npm run build:pwa:production
npm run bootstrap:database:demo
npm run diagnose:voice-reports:azure
npm run test:voice-reports:azure
```
