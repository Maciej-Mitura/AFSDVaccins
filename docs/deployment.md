# Public deployment runbook (Phase 24)

Manual-first deployment for the exam/demo environment:

| Layer    | Provider                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------- |
| PWA      | Firebase Hosting (Vite static build)                                                           |
| API      | Railway (existing `packages/api/Dockerfile`, **exactly one replica**, Serverless **disabled**) |
| Database | MongoDB Atlas M0 (`mongodb+srv`, TLS)                                                          |

**Status (Phase 24B):** repository preparation is complete. **No public deployment has been verified yet.** DEVOPS-007 remains incomplete until a third party can open the public URL and log in.

Do **not** add automatic GitHub Actions production deploy until a manual deployment succeeds (Phase 24C+).

---

## Architecture constraints (do not violate)

- **One API replica only** — PubSub, application cache, and throttling are process-local.
- **Railway Serverless / app sleeping disabled** — WebSocket subscriptions must stay connected.
- **No MongoDB container on Railway** — Atlas only for the public stack.
- **No seed/bootstrap on API startup** — Docker `CMD` is `node dist/main.js` only.
- **No E2E auth bypass in production** — `ALLOW_E2E_AUTH_BYPASS` / `VITE_E2E_AUTH_BYPASS` must stay off.
- **No secrets in Git** — placeholders only in tracked examples.

---

## Environment matrix

### PWA build-time public variables

| Variable                            | Required   | Safe example                     | Destination            | Rebuild?               |
| ----------------------------------- | ---------- | -------------------------------- | ---------------------- | ---------------------- |
| `VITE_BACKEND_URL`                  | yes (prod) | `https://<railway-host>/graphql` | Firebase Hosting build | rebuild + redeploy PWA |
| `VITE_BACKEND_WS_URL`               | yes (prod) | `wss://<railway-host>/graphql`   | Firebase Hosting build | rebuild + redeploy PWA |
| `VITE_FIREBASE_API_KEY`             | yes        | Firebase web config (public)     | Hosting build          | rebuild + redeploy     |
| `VITE_FIREBASE_AUTH_DOMAIN`         | yes        | `<project>.firebaseapp.com`      | Hosting build          | rebuild + redeploy     |
| `VITE_FIREBASE_PROJECT_ID`          | yes        | Firebase project id              | Hosting build          | rebuild + redeploy     |
| `VITE_FIREBASE_STORAGE_BUCKET`      | yes        | `<project>.appspot.com`          | Hosting build          | rebuild + redeploy     |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | yes        | numeric sender id                | Hosting build          | rebuild + redeploy     |
| `VITE_FIREBASE_APP_ID`              | yes        | `1:…:web:…`                      | Hosting build          | rebuild + redeploy     |

Validate with `npm run build:pwa:production` (HTTPS + WSS required; rejects `replace-me` and E2E bypass).

### API runtime — non-secret

| Variable                      | Required    | Safe example                           | Destination | Restart? |
| ----------------------------- | ----------- | -------------------------------------- | ----------- | -------- |
| `NODE_ENV`                    | yes         | `production`                           | Railway     | restart  |
| `PORT`                        | platform    | injected by Railway                    | Railway     | —        |
| `URL_FRONTEND`                | yes         | exact PWA origin (`https://….web.app`) | Railway     | restart  |
| `DB_NAME`                     | yes         | `vaccin-delivery-demo`                 | Railway     | restart  |
| `TRUST_PROXY`                 | recommended | `1` (one hop; **not** `true`)          | Railway     | restart  |
| Throttle/cache/GraphQL limits | optional    | see `.env.example` defaults            | Railway     | restart  |

### API runtime — secrets

| Variable                         | Required      | Safe example                                      | Destination     | Restart? |
| -------------------------------- | ------------- | ------------------------------------------------- | --------------- | -------- |
| `DB_HOST`                        | yes           | `mongodb+srv://<user>:<password>@<cluster-host>/` | Railway secret  | restart  |
| `FIREBASE_SERVICE_ACCOUNT_JSON`  | yes (Railway) | raw SA JSON **or** base64 JSON                    | Railway secret  | restart  |
| `GOOGLE_APPLICATION_CREDENTIALS` | local/Compose | file path to mounted SA JSON                      | local / Compose | restart  |

**Credential precedence:** `FIREBASE_SERVICE_ACCOUNT_JSON` → `GOOGLE_APPLICATION_CREDENTIALS` → safe startup failure. A malformed env JSON does **not** fall back to the file path.

### One-off bootstrap variables (remove after success)

| Variable                       | Required | Value                               |
| ------------------------------ | -------- | ----------------------------------- |
| `ALLOW_DATABASE_BOOTSTRAP`     | yes      | `true`                              |
| `CONFIRM_DATABASE_BOOTSTRAP`   | yes      | `BOOTSTRAP_PUBLIC_DEMO_DATABASE`    |
| `SEED_DEMO_PASSWORD`           | yes      | rotated demo password (env only)    |
| `SEED_TEACHER_ADMIN_PASSWORD`  | yes      | rotated teacher password (env only) |
| `SEED_PERSONAL_ADMIN_EMAIL`    | yes      | your admin email                    |
| Optional `SEED_*_FIREBASE_UID` | optional | link existing Auth users            |

After bootstrap: delete/unset bootstrap gates and passwords from Railway (or the one-off shell). Keep API secrets (`DB_HOST`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `URL_FRONTEND`).

### Local-only

| Variable                         | Notes                                          |
| -------------------------------- | ---------------------------------------------- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Compose mounts SA JSON                         |
| `ALLOW_DATABASE_SEED`            | development seed only (`NODE_ENV=development`) |
| `FIREBASE_CREDENTIALS_HOST_PATH` | Compose host path                              |
| Local `VITE_*` HTTP/WS           | Vite dev / local Compose PWA                   |

### Test-only — forbidden in production

| Variable                | Rule                                                    |
| ----------------------- | ------------------------------------------------------- |
| `ALLOW_E2E_AUTH_BYPASS` | requires `NODE_ENV=test`; never on Railway              |
| `VITE_E2E_AUTH_BYPASS`  | refused by production PWA validation and PWA Dockerfile |

---

## Manual sequence

Every step below is **manual**. This phase does not run provider CLIs for you.

### A. Push and verify CI

1. Ensure `develop` is clean and pushed.
2. Confirm GitHub Actions are green on the latest SHA (CI API, CI API E2E, CI PWA, CI Docker smoke, CI Playwright).
3. Optionally run locally: `npm run validate:production-readiness`.

### B. Create Atlas cluster / user / allowlist

1. Create an **M0** cluster.
2. Create a database user with **least privileges** required for the app (read/write on the demo database only).
3. URL-encode special characters in the username/password when building `DB_HOST`.
4. Example shape (placeholders only):

   ```text
   DB_HOST=mongodb+srv://<user>:<password>@<cluster-host>/
   DB_NAME=vaccin-delivery-demo
   ```

5. Configure Network Access (IP allowlist). For the **exam public demo only**, temporary `0.0.0.0/0` is an accepted deliberate tradeoff — document it and prefer tightening later. Never expose MongoDB from Docker/Railway ports.
6. Do **not** put the real URI in Git.

### C. Create Railway project / API service

1. New Railway project → new service from this GitHub repo.
2. **Root directory / build context:** repository root (`examMaciej/`).
3. **Dockerfile path:** `packages/api/Dockerfile`.
4. **Start command:** image default (`node dist/main.js`) — do not override to bootstrap/seed.
5. **Replicas:** exactly **1**.
6. **Serverless / app sleeping:** **disabled**.
7. No persistent volume required (no local filesystem assumptions).
8. Health check path: `/health`.
9. WebSocket path: `/graphql` (same HTTP upgrade host).

### D. Configure Railway variables and credential secret

Set at least:

```text
NODE_ENV=production
URL_FRONTEND=https://placeholder-until-pwa-deployed.web.app
DB_HOST=mongodb+srv://<user>:<password>@<cluster-host>/
DB_NAME=vaccin-delivery-demo
TRUST_PROXY=1
FIREBASE_SERVICE_ACCOUNT_JSON=<raw JSON or base64 JSON>
```

`PORT` is injected by Railway — do not hardcode conflicting values.

Optional: throttle/cache/GraphQL/body-limit overrides from `packages/api/.env.example`.

### E. Deploy API and verify `/health`

1. Trigger a Railway deploy from the chosen commit.
2. Open `https://<railway-host>/health` and confirm a healthy response.
3. Confirm GraphiQL is **not** available in production.

### F. Run the one-off demo bootstrap

From a trusted machine with network access to Atlas (and Firebase Admin), using **rotated** passwords:

```bash
# After building the API (or using an image with dist/ present)
cd packages/api   # or use root workspace script

# Example — set secrets in the shell / Railway one-off run, never commit them:
export NODE_ENV=production
export URL_FRONTEND=https://placeholder-until-pwa-deployed.web.app
export DB_HOST='mongodb+srv://<user>:<password>@<cluster-host>/'
export DB_NAME=vaccin-delivery-demo
export FIREBASE_SERVICE_ACCOUNT_JSON='...'   # or GOOGLE_APPLICATION_CREDENTIALS=...
export ALLOW_DATABASE_BOOTSTRAP=true
export CONFIRM_DATABASE_BOOTSTRAP=BOOTSTRAP_PUBLIC_DEMO_DATABASE
export SEED_DEMO_PASSWORD='...'
export SEED_TEACHER_ADMIN_PASSWORD='...'
export SEED_PERSONAL_ADMIN_EMAIL='you@example.com'

npm run bootstrap:database:demo
# or: npm run bootstrap:database:demo:cli  (if already built)
```

Root convenience: `npm run bootstrap:database:demo`.

The CLI:

- enables TypeORM `synchronize` **only for this process** (creates/reconciles indexes);
- seeds demo/reference data idempotently;
- reconciles Firebase Auth + application users;
- prints **created/updated/skipped counts only** (no passwords).

Re-running is safe (idempotent). It never runs from API startup or Railway deploy.

### G. Remove bootstrap-only secrets / gates

Unset from Railway / shell:

- `ALLOW_DATABASE_BOOTSTRAP`
- `CONFIRM_DATABASE_BOOTSTRAP`
- `SEED_DEMO_PASSWORD`
- `SEED_TEACHER_ADMIN_PASSWORD`
- (optional UID overrides if no longer needed)

Keep `DB_HOST`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `URL_FRONTEND`, `TRUST_PROXY`, `DB_NAME`.

### H. Obtain Railway HTTPS API URL

Note the public HTTPS base URL (e.g. `https://<service>.up.railway.app`). GraphQL HTTP and WS both use `/graphql`.

### I. Build PWA with HTTPS/WSS production variables

```bash
export VITE_BACKEND_URL='https://<railway-host>/graphql'
export VITE_BACKEND_WS_URL='wss://<railway-host>/graphql'
export VITE_FIREBASE_API_KEY='...'
export VITE_FIREBASE_AUTH_DOMAIN='...'
export VITE_FIREBASE_PROJECT_ID='...'
export VITE_FIREBASE_STORAGE_BUCKET='...'
export VITE_FIREBASE_MESSAGING_SENDER_ID='...'
export VITE_FIREBASE_APP_ID='...'
# Do NOT set VITE_E2E_AUTH_BYPASS

npm run build:pwa:production
```

Changing any `VITE_*` requires rebuild + redeploy.

### J. Initialize / select Firebase Hosting project

```bash
cp .firebaserc.example .firebaserc
# Edit .firebaserc — replace YOUR_FIREBASE_PROJECT_ID (file is gitignored)
firebase login          # manual — student machine only
firebase use <project>  # or edit .firebaserc
```

Hosting config lives in `firebase.json` (`public`: `packages/pwa/dist`, SPA rewrite, cache headers). No Functions, no API proxy.

### K. Deploy PWA

```bash
firebase deploy --only hosting
```

Record the Hosting origin (e.g. `https://<project>.web.app`).

### L. Add Firebase authorized domain

In Firebase Console → Authentication → Settings → Authorized domains, add the Hosting domain.

### M. Set API `URL_FRONTEND` to the exact PWA origin

Update Railway `URL_FRONTEND` to the exact browser origin (scheme + host, no trailing path mismatch). Redeploy/restart the API so CORS matches.

### N. Verify end-to-end

Manual checklist:

- [ ] CORS allows the PWA origin
- [ ] Login with rotated demo accounts
- [ ] GraphQL HTTP works
- [ ] GraphQL WS subscriptions work without refresh
- [ ] Realtime updates appear
- [ ] PWA installability
- [ ] `/offline.html` loads when offline navigation fallback applies
- [ ] Language switching (nl/en/zh/es)

### O. Rollback

| Layer  | Rollback                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| API    | Redeploy previous Railway deployment / image revision                                                       |
| PWA    | `firebase hosting:clone` prior version or redeploy previous `dist`                                          |
| Data   | Restore Atlas backup / snapshot if available; re-run bootstrap only with gates if demo data must be rebuilt |
| Config | Revert `URL_FRONTEND` / `VITE_*` and rebuild as needed                                                      |

---

## Trust proxy security note

With `TRUST_PROXY=1`, Express trusts **one** hop of `X-Forwarded-For` (Railway’s edge). That makes `req.ip` and throttling reflect the client IP.

Do **not** set `TRUST_PROXY=true` for the planned single-service Railway topology — trusting arbitrary forwarding chains enables IP spoofing if a request can inject forwarded headers past the expected hop count.

Local development leaves `TRUST_PROXY` unset/`false`/`0` (unchanged).

---

## Firebase Admin credentials

| Environment     | Variable                                                                         |
| --------------- | -------------------------------------------------------------------------------- |
| Railway         | `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON or base64) → `credential.cert()` in memory |
| Local / Compose | `GOOGLE_APPLICATION_CREDENTIALS` file path → `applicationDefault()`              |

Never log credential contents. Never write Railway credentials to a tracked path.

---

## Local presentation Compose (unchanged)

`infrastructure/docker-compose-production.yml` remains for local demos (local Mongo + file-mounted Firebase SA). It is **not** the public Railway/Atlas/Hosting path.

---

## Related commands

```bash
npm run validate:production-readiness
npm run build:pwa:production
npm run bootstrap:database:demo
npm run test:docker:safety
```
