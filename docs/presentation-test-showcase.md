# Presentation test showcase (Phase 35F)

Guide for demonstrating the strongest existing tests during the exam.
No production credentials are required. Do not hammer production rate limits.

Selected pair:

| Slot             | Test                                    | Path                                                      |
| ---------------- | --------------------------------------- | --------------------------------------------------------- |
| Primary backend  | Delivery QR confirm E2E (focused cases) | `packages/api/test/delivery-qr-confirm.e2e-spec.ts`       |
| Backup backend   | Authorization boundaries E2E            | `packages/api/test/authz.e2e-spec.ts`                     |
| Primary frontend | Playwright pharmacist order journey     | `tests/apotheker-order.spec.ts`                           |
| Backup frontend  | Offline arrival queue + sync (Vitest)   | `packages/pwa/src/offline/phase-28c-stop-arrival.spec.ts` |

---

## 1. Test stack overview

| Layer                | Framework                                | Approx. size                                                         | What it proves                                                                                  |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| API unit             | Jest (`packages/api` `*.spec.ts`)        | ~128 files                                                           | Domain logic, guards, HMAC helpers, throttling trackers, services with mocked repos             |
| API E2E              | Jest + Supertest + **MongoMemoryServer** | 21 files under `packages/api/test/`                                  | Full Nest `AppModule` over real in-memory Mongo: GraphQL + REST, authz, QR, security            |
| PWA unit / component | Vitest (+ happy-dom / fake-indexeddb)    | ~79 files / ~465 cases                                               | Vue composables, offline IndexedDB, SW safety, voice UI states, filters                         |
| Browser E2E          | Playwright (Chromium only)               | 8 files / 39 tests under `tests/`                                    | Real browser → built PWA preview → Nest test API → MongoMemory                                  |
| Infrastructure       | Node test runner                         | `infrastructure/*.test.mjs`                                          | Docker/production-readiness invariants (static Hosting, Dockerfile CMD, no secrets in examples) |
| CI                   | GitHub Actions                           | `ci-api`, `ci-api-e2e`, `ci-pwa`, `ci-playwright`, `ci-docker-smoke` | Same suites on every relevant PR path                                                           |

**Scripts (root):** `test:api`, `test:e2e:api`, `test:pwa`, `test:e2e:pwa` (Playwright — not `test:playwright`).

Each layer answers a different question: unit = “does this function behave?”; API E2E = “does the assembled server enforce rules against Mongo?”; Vitest = “does the client offline/UI logic hold?”; Playwright = “does a human journey work in a browser?”

---

## 2. Primary backend demonstration

**File:** [`packages/api/test/delivery-qr-confirm.e2e-spec.ts`](../packages/api/test/delivery-qr-confirm.e2e-spec.ts)  
**Describe:** `Delivery QR confirm (e2e)`

### Recommended focused cases

| Case (name pattern)                 | What it shows                                                        |
| ----------------------------------- | -------------------------------------------------------------------- |
| `unrelated courier rejected`        | Wrong courier → forbidden                                            |
| `repeated confirmation is rejected` | Replay after successful confirm                                      |
| `without double stock`              | Crash recovery (`PROCESSING`) resumes without double stock decrement |

Together these cover **HMAC token validation**, **courier ownership**, **replay protection**, and **idempotent stock / order / proof** handling.

### Exact command (PowerShell)

```powershell
cd c:\Users\mimac\Desktop\afsdVaccins\examMaciej\packages\api
$env:NODE_ENV = 'test'
npx jest --config=./jest-e2e.json --runInBand --forceExit `
  --testNamePattern="unrelated courier rejected|repeated confirmation is rejected|without double stock" `
  test/delivery-qr-confirm.e2e-spec.ts
```

| Item               | Value                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Working directory  | `packages/api`                                                                                   |
| Prerequisites      | `npm install` at repo root; Node 20+; no Atlas/Firebase/Azure secrets                            |
| Auth in this suite | Firebase **mocked** via E2E bearer tokens — isolates auth so the test focuses on QR/domain rules |
| Database           | **MongoMemoryServer** (started by Jest `globalSetup`)                                            |
| Expected duration  | First run ~2–5 min (Mongo binary download + Nest boot); warm ~1–3 min                            |
| Success indicator  | All matched tests `PASS`; process exit `0`                                                       |
| Expected output    | Jest summary with 3 passing tests; responses must not print raw QR signing secrets               |

### Risk being tested

A stolen or re-scanned stop QR must not let the wrong courier confirm delivery, and a retry or crash mid-confirmation must not decrement stock twice or invent a second proof.

### Setup → action → assertions

1. **Setup:** Fixtures seed pharmacist, vaccines, orders, route template, assigned courier route; stop QR is HMAC-signed (`DELIVERY_QR_SIGNING_SECRET` test default).
2. **Action:** `POST /delivery-routes/qr/confirm` as wrong courier; confirm successfully then again; force `PROCESSING` mid-flow and resume.
3. **Assertions:** `403` / conflict for abuse and replay; single proof + audit on success path; stock adjustment count stable on crash recovery.

### Production source files involved

- `packages/api/src/routes/qr/delivery-qr-confirm.controller.ts`
- `packages/api/src/routes/qr/delivery-qr-confirm.service.ts`
- `packages/api/src/routes/qr/hmac-delivery-qr-token.service.ts`
- Stock decrement / order delivery paths used by confirm
- QR confirm audit entity/service

### Why stronger than a basic unit test

The suite boots the **real Nest application**, hits the **real HTTP route**, persists through **Mongo**, and exercises ownership + consume + stock in one transaction story. Unit tests mock repositories; this catches wiring and persistence bugs teachers care about.

### Spoken explanation (~45–60 s) — English

> This backend E2E test protects proof of delivery. Each stop QR is an HMAC-signed token — not a guessable ID. Only the assigned courier may confirm. After a successful confirm, the token is consumed, so a replay is rejected. If the process crashes while marked PROCESSING, recovery resumes without decrementing stock twice. We run this against MongoMemoryServer with Firebase mocked only for authentication, so we prove Nest and Mongo behaviour without production credentials.

### Spoken explanation (~45–60 s) — Dutch

> Deze backend E2E-test beschermt het bewijs van levering. Elke stop-QR is een HMAC-ondertekend token, geen raadbaar ID. Alleen de toegewezen koerier mag bevestigen. Na een geslaagde bevestiging wordt het token geconsumeerd, zodat een herhaling wordt geweigerd. Als het proces crasht tijdens PROCESSING, hervat herstel zonder de voorraad dubbel te verlagen. We draaien dit op MongoMemoryServer met Firebase alleen gemockt voor authenticatie, zodat we Nest en Mongo bewijzen zonder productiegegevens.

---

## 3. Backup backend demonstration

**File:** [`packages/api/test/authz.e2e-spec.ts`](../packages/api/test/authz.e2e-spec.ts)  
**Describe:** `GraphQL E2E — authorization boundaries`

### Exact command (PowerShell)

```powershell
cd c:\Users\mimac\Desktop\afsdVaccins\examMaciej\packages\api
$env:NODE_ENV = 'test'
npx jest --config=./jest-e2e.json --runInBand --forceExit test/authz.e2e-spec.ts
```

### What it proves

- APOTHEKER / BEZORGER blocked from ADMIN GraphQL operations
- ADMIN blocked from BEZORGER-only tomorrow preview
- Courier cannot mutate another courier’s route
- **Pharmacists cannot see each other’s orders** (`keeps pharmacist order data private across apothekers`)

### When to switch

Use this if the QR suite is too slow, flaky under time pressure, or MongoMemory is still downloading. Same stack; shorter file; clearer narration of roles.

### Short spoken explanation

> This GraphQL E2E suite shows role and ownership boundaries: wrong roles get denied, and one pharmacist never receives another pharmacy’s orders from the API — enforced in Nest, not only in the UI.

---

## 4. Primary frontend demonstration

**File:** [`tests/apotheker-order.spec.ts`](../tests/apotheker-order.spec.ts)  
**Describe:** `APOTHEKER journey`

### Exact commands (PowerShell)

```powershell
# One-time Chromium install (repo root)
cd c:\Users\mimac\Desktop\afsdVaccins\examMaciej
npx playwright install chromium

# Headed demo (repo root — required)
npx playwright test tests/apotheker-order.spec.ts --headed
```

| Item               | Value                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Working directory  | **Monorepo root** (`examMaciej/`)                                                                    |
| Ports              | **3100** (Nest Playwright API) and **4174** (PWA Vite preview) must be free                          |
| Prerequisites      | Root `npm install`; Chromium installed; first run builds API + PWA                                   |
| Expected duration  | First run several minutes (builds + MongoMemory); warm ~1–3 min                                      |
| Visible in browser | Dutch UI: Apotheker dashboard → Nieuwe bestelling → select vaccine → place order → Mijn bestellingen |

### Production path exercised

**UI → GraphQL → NestJS → MongoDB** (test API on MongoMemoryServer; not Railway/Atlas).

Ownership / scoping:

- Apotheker1 creates an order and sees it on “Mijn bestellingen”
- Apotheker2’s list must not show `E2E Apotheek 1`

### E2E auth bypass (accurate wording)

| Fact             | Detail                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Purpose          | Stable CI/browser login without live Firebase users                                                      |
| Dual-gated (API) | Requires `NODE_ENV=test` **and** `ALLOW_E2E_AUTH_BYPASS=true`                                            |
| PWA              | Preview script sets `VITE_E2E_AUTH_BYPASS=true` only for Playwright preview builds                       |
| Production       | `build:pwa:production` / env validation **rejects** `VITE_E2E_AUTH_BYPASS`; Docker build also refuses it |
| Not              | Equivalent to bypassing production security — production never enables this path                         |

### Spoken explanation — English

> This Playwright test is a full browser journey: the pharmacist logs in, creates an order through the real UI, and GraphQL hits our Nest API backed by Mongo. A second pharmacist’s list stays scoped — they never see the other pharmacy’s orders. Auth bypass exists only under dual-gated test mode; production builds reject it.

### Spoken explanation — Dutch

> Deze Playwright-test is een volledige browserflow: de apotheker logt in, maakt via de echte UI een bestelling, en GraphQL raakt onze Nest-API met Mongo. De lijst van een tweede apotheker blijft afgeschermd — die ziet nooit de bestellingen van de andere apotheek. Auth-bypass bestaat alleen in dubbel afgeschermde testmodus; productiebuilds weigeren die.

---

## 5. Backup frontend demonstration

**File:** [`packages/pwa/src/offline/phase-28c-stop-arrival.spec.ts`](../packages/pwa/src/offline/phase-28c-stop-arrival.spec.ts)  
**Describe:** `Phase 28C offline stop arrival queue and sync`

### Exact command (PowerShell)

Prefer direct Vitest (avoids npm named-argument forwarding issues):

```powershell
cd c:\Users\mimac\Desktop\afsdVaccins\examMaciej\packages\pwa
npx vitest run src/offline/phase-28c-stop-arrival.spec.ts
```

From repo root (alternative):

```powershell
cd c:\Users\mimac\Desktop\afsdVaccins\examMaciej
npx vitest run --config packages/pwa/vitest.config.ts packages/pwa/src/offline/phase-28c-stop-arrival.spec.ts
```

### What it proves

| Behaviour                                                       | Why it matters                          |
| --------------------------------------------------------------- | --------------------------------------- |
| Offline “mark arrived” **queues** one action + overlay          | No fake local delivery                  |
| **FIFO** reconnect sync (oldest first)                          | Ordered flush after reconnect           |
| Transient failure **retries**; **conflict does not** auto-retry | Avoids blind hammering                  |
| **Cross-courier isolation** / logout blocks sync                | Another courier cannot flush your queue |
| **No local stock / delivery mutation** on enqueue               | Server remains source of truth          |

This is real **offline-first correctness** in the client modules (IndexedDB + sync policy), not a thin “offline banner” UI check.

**Duration:** a few seconds. No browser, no Firebase, no ports.

---

## 6. Exact command sheet (copy-paste)

```powershell
# === PRIMARY BACKEND (QR focused) ===
cd c:\Users\mimac\Desktop\afsdVaccins\examMaciej\packages\api
$env:NODE_ENV = 'test'
npx jest --config=./jest-e2e.json --runInBand --forceExit `
  --testNamePattern="unrelated courier rejected|repeated confirmation is rejected|without double stock" `
  test/delivery-qr-confirm.e2e-spec.ts

# === BACKUP BACKEND (authz) ===
cd c:\Users\mimac\Desktop\afsdVaccins\examMaciej\packages\api
$env:NODE_ENV = 'test'
npx jest --config=./jest-e2e.json --runInBand --forceExit test/authz.e2e-spec.ts

# === PRIMARY FRONTEND (Playwright headed) ===
cd c:\Users\mimac\Desktop\afsdVaccins\examMaciej
npx playwright install chromium
npx playwright test tests/apotheker-order.spec.ts --headed

# === BACKUP FRONTEND (Phase 28C Vitest) ===
cd c:\Users\mimac\Desktop\afsdVaccins\examMaciej\packages\pwa
npx vitest run src/offline/phase-28c-stop-arrival.spec.ts

# === OPTIONAL FULL SUITES (root) ===
cd c:\Users\mimac\Desktop\afsdVaccins\examMaciej
npm run test:e2e:api
npm run test:pwa
npm run test:e2e:pwa
```

**Security / rate-limit E2E** (separate Jest config — do not use `jest-e2e.json`):

```powershell
cd c:\Users\mimac\Desktop\afsdVaccins\examMaciej\packages\api
$env:NODE_ENV = 'test'
npx jest --config=./jest-e2e-security.json --runInBand --forceExit --testNamePattern="rate-limits"
```

---

## 7. Expected output and timing

| Command                         | First run   | After warm-up | Success indicator                 | Likely failure cause                                                     |
| ------------------------------- | ----------- | ------------- | --------------------------------- | ------------------------------------------------------------------------ |
| QR focused Jest E2E             | 2–5+ min    | 1–3 min       | 3 tests PASS, exit 0              | Wrong cwd; `NODE_ENV` unset; MongoMemory download; pattern typo          |
| Authz E2E                       | 1–2 min     | 30–90 s       | 4 tests PASS                      | Same as above                                                            |
| Playwright apotheker `--headed` | Several min | 1–3 min       | 2 tests green; browser UI visible | Port 3100/4174 busy; Chromium missing; stale build; wrong cwd (not root) |
| Phase 28C Vitest                | &lt; 15 s   | &lt; 10 s     | All cases PASS                    | Wrong package path; broken `node_modules`                                |
| `test:e2e:security` rate-limit  | 1–2 min     | ~1 min        | Burst returns `RATE_LIMITED`      | Used wrong config (`jest-e2e.json` ignores this file)                    |

---

## 8. Presentation flow (≈4–6 minutes)

1. **Slide — test architecture** (unit / API E2E / Vitest / Playwright / CI) — 30 s
2. **Explain backend risk** (forged QR, wrong courier, replay, double stock) — 30–45 s
3. **Run QR focused E2E** (command already in terminal; narrate while green) — 60–90 s
4. **Explain frontend E2E** (UI → GraphQL → Nest → Mongo; ownership; bypass only in test) — 30–45 s
5. **Run headed Playwright** (warmed earlier if possible) — 60–90 s
6. **Show CI green** (`ci-api-e2e`, `ci-playwright`) — 20 s
7. **Mention backups** (authz E2E; Phase 28C Vitest) — 15 s

**Rehearsal tip:** Warm Playwright once before the exam so the live run is not a cold Nest+Vite build.

---

## 9. Likely teacher questions and answers

**Why mock Firebase in E2E?**  
So tests are deterministic and secret-free. We still exercise Nest guards and domain rules; token verification is stubbed with known E2E identities.

**Why use MongoMemoryServer?**  
Real Mongo wire protocol and indexes without Atlas credentials or shared cloud state. Resets between tests.

**Is the Playwright test really end to end?**  
Yes for the product path: Chromium → built PWA → Nest HTTP/GraphQL → Mongo. It is not production Firebase Hosting / Railway — that would need secrets and be flaky for CI.

**Why no Redis?**  
Single Railway replica by design. Throttling and application cache are process-local. Redis would matter if we scaled replicas.

**Why no API Gateway?**  
One Nest backend already owns auth, throttle, CORS, and GraphQL limits. Railway is TLS/edge proxy, not a dedicated API Gateway. Adding Kong/APIM would be ops cost without multi-service need.

**API response cache vs memory cache vs service-worker vs IndexedDB?**

- **HTTP response cache:** not used for API (authenticated payloads use `no-store` where relevant).
- **Memory cache:** Nest `cache-manager` for settings/vaccines/analytics keys (process-local TTL).
- **Service worker:** precaches static assets; API/GraphQL are NetworkOnly.
- **IndexedDB:** courier offline private data (routes, pending arrivals) — not an HTTP cache.

**How does the project prevent QR replay?**  
HMAC verify + consume (`consumedAt` / nonce). Second confirm conflicts; preview of consumed tokens fails.

**How do you know one pharmacist cannot see another’s orders?**  
API E2E `authz` + Playwright second-pharmacist scoping. Enforcement is server-side ownership, not only hidden nav.

**Why are production credentials not used in tests?**  
Safety, determinism, CI portability. Fake/Azure providers and memory Mongo cover behaviour; optional Azure integration tests are opt-in and separate.

**What happens if a live test fails?**  
Switch immediately: QR → authz; Playwright → Phase 28C Vitest. Explain the same risk with the backup. Do not debug production secrets live.

---

## 10. Troubleshooting and fallback plan

| Symptom                                | Fix                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Ports **3100** / **4174** busy         | Stop leftover Playwright/API/preview processes; or reboot terminal sessions holding those ports |
| Chromium missing                       | `npx playwright install chromium` from repo root                                                |
| Playwright cold start                  | Run the headed command once before the presentation                                             |
| MongoMemoryServer first-download delay | Wait; keep QR command ready; use authz if clock is tight                                        |
| Security tests “not found” / skipped   | Use `jest-e2e-security.json` / `npm run test:e2e:security` — **not** `jest-e2e.json`            |
| Stale build                            | From root: rebuild or re-run Playwright (webServer rebuilds); for API unit, no build required   |
| Wrong directory                        | Backend commands: `packages/api`. Playwright: **repo root**. Vitest backup: `packages/pwa`      |

### Fallback sequence

1. Primary QR focused E2E → if slow/fail → **authz E2E**
2. Primary Playwright apotheker → if ports/build fail → **Phase 28C Vitest**
3. Optional: show CI green history instead of re-running long suites

---

## 11. Optional short demos (do not prioritise)

Safe, short, no production hammering:

| Demo              | How                                                                   |
| ----------------- | --------------------------------------------------------------------- |
| Hosted API health | `curl -sS https://<railway-host>/health`                              |
| GraphQL health    | `POST …/graphql` with `{ health { status service } }`                 |
| Helmet headers    | `curl -sSI https://<railway-host>/health`                             |
| Wrong-role denial | Playwright `tests/role-isolation.spec.ts --headed` or authz E2E       |
| Rate-limit E2E    | Local `jest-e2e-security.json` + `--testNamePattern=rate-limits` only |
| CI green          | GitHub Actions: `ci-api-e2e`, `ci-playwright`                         |

Do **not** burst GraphQL against the live Railway URL to demo 429s.

---

## Related docs

- [deployment.md](./deployment.md) — Railway / Hosting / `TRUST_PROXY`
- [phase-28c-offline-stop-arrival.md](./phase-28c-offline-stop-arrival.md) — offline arrival design
- Root scripts: `package.json` → `test:e2e:pwa` (Playwright)
