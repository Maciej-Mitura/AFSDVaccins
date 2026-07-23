# Agent Rules — Vaccinatie-levering

**Version:** 2026-07-23  
**Architecture:** `docs/project-architecture.md`  
**Roadmap:** `docs/implementation-roadmap.md`  
**Enhancement planning:** `docs/enhancement-planning.md`

Agents working on this project must read this file at the start of every session. Acknowledge by stating: _Using Vaccinatie-levering agent rules._

---

## 1. Project identity

| Item                          | Value                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Project name**              | Vaccinatie-levering                                                                                                                  |
| **Target repository**         | `examAfsdMaciejMitura/`                                                                                                              |
| **Domain**                    | Digital platform for vaccine ordering and delivery route management (apotheker, admin, bezorger)                                     |
| **Build approach**            | **Greenfield from scratch** — no starter scaffold, no copy-paste from teacher demo                                                   |
| **Teacher repository**        | `bearspray-2025-demo/` — **read-only** reference for patterns at `develop` @ `ad691e3`                                               |
| **Teacher domain**            | Bear Spray (machines, canisters, reservations, Mapbox, weather) — **must never appear** in exam code, entities, routes, or seed data |
| **Authoritative design docs** | Approved `project-architecture.md`, `implementation-roadmap.md`, and Phase 21+ `enhancement-planning.md`                             |

This is an individual AFSD exam submission. Agents optimize for **correctness, security, traceability, and oral-exam explainability** — not for speed through multiple roadmap phases at once.

---

## 2. Source-of-truth order

When making decisions, apply sources in this order (higher wins):

| Rank | Source                                       | Location                                          |
| ---- | -------------------------------------------- | ------------------------------------------------- |
| 1    | Project fiche (business rules, roles, flows) | `docs/project-fiche.md`                           |
| 2    | Official assignment and rubric               | `docs/description.md`                             |
| 3    | Approved project architecture                | `docs/project-architecture.md`                    |
| 4    | Approved implementation roadmap              | `docs/implementation-roadmap.md`                  |
| 5    | Enhancement planning (Phase 21+)             | `docs/enhancement-planning.md`                    |
| 6    | Requirements matrix                          | `docs/requirements-matrix.md`                     |
| 7    | Course implementation map                    | `docs/course-implementation-map.md`               |
| 8    | Teacher reference patterns                   | `bearspray-2025-demo/` (read-only, patterns only) |
| 9    | General engineering recommendations          | Industry best practice, agent defaults            |

### Conflict rules

- **Never silently resolve** a conflict that changes business behaviour, security, or architecture.
- If a user request conflicts with architecture or roadmap, **stop and report** the conflict with citations to the higher source.
- If the teacher demo contradicts assignment docs (e.g. disabled PWA, incomplete authz, PostgreSQL in README), **follow assignment + architecture**, not the demo.
- Provisional policy defaults (closing time 14:00, ISO week, 90% warning) are configurable — do not hardcode different values without documentation approval.

---

## 3. Phase discipline

Implementation follows **`docs/implementation-roadmap.md`** phases **0–33**.

### Mandatory rules

1. **Every task must name exactly one roadmap phase or subphase** (e.g. “Phase 7 — Apotheker ordering vertical slice” or “Phase 22 — Backend security foundation”).
2. **Implement only that phase.** Do not add files, modules, or features belonging to later phases.
3. **Stop after the requested phase.** Do not continue into the next phase unless the user explicitly requests it in a new message.
4. **Tier C / optional extras** (tracking, cold-chain hardware, push, trust, Sentry, K8s, etc.) are forbidden unless the active roadmap phase lists them or the user explicitly approves that phase.
5. **Unrelated refactors are forbidden** during a phase (no drive-by renames, no “while I’m here” dependency upgrades across the repo).
6. **Architectural changes** (new entities, new modules, stack changes, FSM changes) require **documentation update and user approval** before coding.

### Prerequisites discovered mid-phase

If implementation reveals a missing prerequisite from an **earlier** phase:

1. **Report it** in the pre-edit protocol (section 4).
2. **Explain why** it blocks the current phase.
3. **Do not implement** the prerequisite without user approval when it exceeds the current phase scope.
4. If the prerequisite is a **one-line fix** already part of the current phase’s explicit scope (e.g. missing import in a file you are already editing), it may be included — report it in the completion protocol.

### Global stop conditions

Obey roadmap global stop conditions: failing typecheck/tests, unresolved authz, stale generated types, teacher source in repo, destructive DB ops without approval. **Do not proceed** to the next phase until resolved.

---

## 4. Pre-edit protocol

**Before modifying any file**, the agent must output the following (use section 24 template):

- Phase being implemented
- Files expected to change
- Dependencies expected to be added
- Commands expected to run
- Architecture sections and requirement IDs being followed
- Risks or uncertainties

### Must stop and ask for clarification when

- Requested work **conflicts** with architecture or roadmap
- **Ownership or role behaviour** is unclear (who may call which mutation)
- A **destructive database operation** is required (drop collection, wipe DB, non-idempotent seed)
- A **new dependency** materially changes the stack (see section 8)
- A requirement **cannot be traced** to an approved source (fiche, assignment, architecture, roadmap)
- User asks to implement **multiple phases** in one session without explicit approval
- User asks to **copy** files from `bearspray-2025-demo/`

---

## 5. Completion protocol

**After editing**, the agent must output the completion section of the template (section 24), including:

- Files created and modified
- Dependencies added or removed
- Commands **actually run** (not planned)
- **Exact command results** (exit codes, relevant stdout/stderr summary)
- Tests passed / failed / not run (with reason)
- Requirement IDs satisfied
- Work intentionally deferred to a later phase
- Known limitations introduced or preserved
- Recommended commit message

### Hard rule

**Never claim** a command or test passed unless it was **executed in the session** and the result is reported honestly. If a command cannot run (missing env, no MongoDB), state that explicitly.

---

## 6. Git workflow

| Branch      | Purpose                                     |
| ----------- | ------------------------------------------- |
| `main`      | Stable submission / presentation branch     |
| `develop`   | Active integration branch                   |
| `feature/*` | Phase or slice work — branch from `develop` |

### Feature branch naming (examples)

- `feature/phase-0-repo-init`
- `feature/api-foundation`
- `feature/pwa-foundation`
- `feature/firebase-auth`
- `feature/users-and-roles`
- `feature/apotheker-ordering`
- `feature/realtime-notifications`
- `feature/stock-management`
- `feature/route-generation`
- `feature/seed-system`
- `feature/docker-stack`

### Commit discipline

- Each roadmap phase normally ends with **one focused commit** or a **small coherent set** (e.g. api + tests, not api + unrelated pwa polish).
- Use the roadmap’s **recommended commit message** when provided.
- **Never commit:** secrets, `.env`, Firebase service-account JSON, `node_modules`, generated `dist/` (unless course explicitly requires), teacher demo files, debug screenshots, coverage/playwright report artifacts.
- **Do not** rewrite Git history (`rebase`, `reset --hard`, force-push) unless the user explicitly asks.
- **Do not** run `git config` changes.

---

## 7. Repository boundaries

### Belongs in `examAfsdMaciejMitura/`

- Application source (`packages/api`, `packages/pwa`, `packages/types`)
- `infrastructure/` (Docker Compose, nginx)
- `tests/` (Playwright at repo root)
- `.github/workflows/` (CI)
- `AGENTS.md` (this document)
- `README.md` and submission-required docs
- Approved copies of architecture and roadmap in `docs/`
- `.env.example` files (placeholders only)
- `firebase-service-account.json.example` (dummy structure)

### Must NOT be included

- `bearspray-2025-demo/` or any Bear Spray source
- Workspace-level research duplicates unless intentionally copied as approved docs
- Real Firebase Admin service-account files
- Committed `.env` files
- Generated `packages/api/dist/`, `packages/types/dist/`, build artifacts
- `@afsd-mct/*` package names or Bear Spray domain terms
- Temporary debug logs, accidental screenshots, local credential exports

---

## 8. Approved stack

Agents must use **only** this stack unless an **approved roadmap phase** or **explicit user instruction** adds a justified exception:

| Layer      | Technology                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo   | npm workspaces (`@vaccin-delivery/api`, `@vaccin-delivery/pwa`, `@vaccin-delivery/types`)                                                                                       |
| API        | NestJS, code-first GraphQL, class-validator                                                                                                                                     |
| Database   | MongoDB via TypeORM                                                                                                                                                             |
| Frontend   | Vue 3, Vite, TypeScript, Composition API (`<script setup>`)                                                                                                                     |
| Routing    | Vue Router (groups: `/auth`, `/apotheker`, `/admin`, `/bezorger`)                                                                                                               |
| UI         | Nuxt UI (preferred over hand-written Tailwind)                                                                                                                                  |
| Client API | Apollo Client (HTTP + `graphql-ws` for subscriptions)                                                                                                                           |
| Auth       | Firebase client SDK + Firebase Admin SDK (email/password; PKCE applicability unresolved — do not implement unless OAuth authorization-code is added or the teacher requires it) |
| Types      | GraphQL Code Generator → `@vaccin-delivery/types`                                                                                                                               |
| Realtime   | GraphQL subscriptions via `graphql-ws`                                                                                                                                          |
| Testing    | Jest, Supertest, Playwright                                                                                                                                                     |
| Ops        | Docker Compose, GitHub Actions                                                                                                                                                  |

### Forbidden without explicit approval

- Another backend framework or primary REST API
- Mongoose, Prisma, or another ORM replacing TypeORM for MongoDB
- Pinia, Vuex, or Options API as primary Vue pattern
- Alternative auth providers (Auth0, custom JWT) replacing Firebase
- Lerna (workspaces-only scripts are sufficient)
- Kubernetes, Sentry/LogRocket (unless the active roadmap phase explicitly adds them)
- Offline mutation queues, authenticated GraphQL response caching in service worker
- Mapbox, weather APIs, or other Bear Spray-specific integrations
- Runtime i18n / rate limiting / caching / public deploy / images / AI / QR / tracking / cold-chain / push / trust **before** their numbered roadmap phases (22–31)

### Small utility dependencies

May be added **only when**:

- Required by the current roadmap phase
- Justified in pre-edit protocol (e.g. `date-fns-tz` for timezone policy)
- Reported in completion protocol

---

## 9. TypeScript rules

- Enable **strict** TypeScript in API and PWA.
- **No `any`** unless externally unavoidable — document why in completion report.
- **No `@ts-ignore`**, **no `@ts-nocheck`**, **no fabricated casts** to silence errors.
- **No manually duplicated GraphQL response types** in PWA — use generated types from `@vaccin-delivery/types`.
- Public service and policy methods must have **explicit parameter and return types**.
- Use **enums** for `Role`, `OrderStatus`, `RouteStatus`, `NotificationType`, and other domain states.
- Regenerate GraphQL types after schema changes (`npm run generate:graphql`).

---

## 10. Backend structure

### Pattern

```
resolver → service → entity/repository
```

- **Module-per-domain** — one bounded context per NestJS module.
- **Resolvers stay thin** — parse args, call service, map errors; no business rules in resolvers.
- **Business rules** live in services or dedicated policies (`DeliveryDatePolicy`, `OrderLimitService`).
- **Cross-module access** only through **exported services** — never inject another module’s repository directly in a resolver.
- **Input DTOs** use `class-validator`; global `ValidationPipe` stays enabled.
- **Errors** return structured, user-safe JSON (`ClientMessage` or GraphQL errors with extensions); use `Nest Logger` for operational logging.
- **No business logic** in GraphQL decorators, guards (beyond auth checks), or frontend.

### Approved domain modules

| Module            | Responsibility                                   |
| ----------------- | ------------------------------------------------ |
| `authentication`  | Firebase verification, guards, WS onConnect      |
| `users`           | User, profiles, role linkage                     |
| `vaccines`        | Catalog (3 types); does not mutate stock balance |
| `orders`          | Placement, limits, status FSM                    |
| `stock`           | Sole writer of `stockQuantity`, audit log        |
| `route-templates` | Template CRUD and bezorger assignment            |
| `routes`          | Generation, today route, RoutePreview, route FSM |
| `notifications`   | Persist + PubSub fan-out                         |
| `settings`        | OperationalSettings singleton                    |
| `seed`            | Idempotent CLI seed only                         |

**Forbidden:** a monolithic `OperationsService` or `AdminService` that owns orders, stock, routes, and notifications together.

### File creation

Unlike the teacher demo rule “never create new files,” this exam project is greenfield. Agents **may create files** when the **current roadmap phase** requires them. Prefer explicit module structure from architecture §3 over ad-hoc placement.

---

## 11. Authentication and authorization

### Identity model

- **Firebase** proves identity (ID token).
- **MongoDB `User`** stores application role, profile FKs, `external_uid`.
- **`@CurrentUser()`** returns the application user derived from the token — never trust client-supplied user IDs.

### Role policy

- Self-registration via `createOwnUser` defaults to **`APOTHEKER`** only.
- **`ADMIN`** and **`BEZORGER`** are assigned via seed or future admin provisioning — **never** from client input.
- Evaluator account `docent@howest.be` is seeded for demo only — document as evaluation credentials, not production secrets.

### Authorization rules

- **Backend enforcement is authoritative.** Frontend route hiding is supplementary only.
- Every query, mutation, and subscription must be consciously **public** (rare) or **protected**.
- Admin operations: `@UseGuards(AuthorizationGuard, RolesGuard)` + `@AllowedRoles(Role.ADMIN)`.
- Apotheker data scoped to `currentUser.apothekerProfileId`.
- Bezorger routes scoped to `currentUser.bezorgerProfileId`.
- Subscriptions: authenticate on connect; **filter payloads** by recipient profile or role.
- Use `ForbiddenException` or `UnauthorizedException` — **never** bare `throw new Error()` for access control.

### Never reproduce teacher demo defects

- Incomplete reservation-style ownership TODOs
- Missing role guards on mutations
- Client-supplied `userId` in GraphQL inputs
- Generic `Error` in `RolesGuard`

---

## 12. Domain rules

Agents must preserve these rules. **Do not invent new business rules silently.**

| ID    | Rule                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------ |
| DR-01 | Exactly **three** active vaccine types in initial catalog (`FLU`, `COVID`, `MMR` or equivalent stable codes) |
| DR-02 | Max **50 doses per day per vaccine type** per apotheker                                                      |
| DR-03 | Max **200 doses per ISO week** (Mon–Sun) across all types per apotheker                                      |
| DR-04 | Timezone **`Europe/Brussels`** for policy calculations                                                       |
| DR-05 | **Closing time** configurable; seed default **14:00** local                                                  |
| DR-06 | Order **before closing** → same-day `deliveryDate`; **after closing** → next day                             |
| DR-07 | **No retroactive** orders                                                                                    |
| DR-08 | Week-warning threshold configurable; default **90%** of weekly cap                                           |
| DR-09 | Apotheker identity for orders derived from token — **never** from client input                               |
| DR-10 | Route generation **skips** pharmacies without qualifying orders for that delivery date                       |
| DR-11 | **One route per bezorger per calendar date**; regeneration **updates** existing route                        |
| DR-12 | **`RoutePreview`** (tomorrow) is **computed**, not persisted                                                 |
| DR-13 | Stock changes **only** through `StockService`                                                                |
| DR-14 | Marking order **DELIVERED** fails when stock insufficient                                                    |
| DR-15 | Delivery decrement is **idempotent** (no double decrement)                                                   |
| DR-16 | Order FSM: `PENDING`, `PLANNED`, `DELIVERED`, `CANCELLED` — controlled transitions only                      |
| DR-17 | Route FSM: `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` — no `DRAFT` in MVP                           |
| DR-18 | **`OUT_FOR_DELIVERY`** order status deferred unless architecture updated                                     |

Display mapping: `PENDING`/`PLANNED` → _in behandeling_; `DELIVERED` → _geleverd_.

---

## 13. Stock rules

1. **`Vaccine.stockQuantity`** is the **authoritative current balance**.
2. **`StockAdjustment`** is **immutable audit history** — never sum adjustments to derive balance at runtime.
3. **Only `StockService`** may modify `stockQuantity`.
4. Every stock mutation runs through **one service operation**: validate → update balance → append audit row with `balanceAfter`.
5. Balance must **never go negative**.
6. Delivery decrement uses idempotency key **`delivery-decrement:{orderId}`**.
7. Repeated `markDelivered` / delivery mutation returns success **without** a second decrement.
8. **`VaccinesService` / vaccine resolvers must not** write `stockQuantity` directly.

---

## 14. GraphQL rules

- **Code-first** schema; emit `packages/api/dist/schema.gql` via build — **do not hand-edit**.
- PWA documents under `packages/pwa/src/assets/graphql/`:
  - `entity.query.ts`
  - `entity.mutation.ts`
  - `entity.subscription.ts` (when phase allows)
- Use **generated types** from `@vaccin-delivery/types` with typed operations.
- **Never accept client ownership fields** where identity is server-derived (`apothekerProfileId`, `bezorgerProfileId`, `role`, `recipientUserId`).
- Every operation document in architecture §8 must define: authentication, role, validation, ownership (in resolver/guard layer).
- Subscriptions: **`graphql-ws`**, authenticated `onConnect`, **recipient filtering** — no global unfiltered streams.
- After contract changes: run `npm run generate:graphql` before PWA typecheck/build.
- **Do not manually edit** `packages/types/dist/graphql.d.ts`.

---

## 15. Frontend rules

### Vue conventions

- **Vue 3 Composition API** with `<script setup>` only — **no Options API** (`data`, `methods`, `computed` option object).
- SFC order: **`<template>` → `<script setup>` → `<style>`** (when style needed).
- Use `defineProps` / `defineEmits` with TypeScript generics.

### Routing

| Group     | Path prefix  | Guard              |
| --------- | ------------ | ------------------ |
| Auth      | `/auth`      | `preventLoggedIn`  |
| Apotheker | `/apotheker` | auth + `APOTHEKER` |
| Admin     | `/admin`     | auth + `ADMIN`     |
| Bezorger  | `/bezorger`  | auth + `BEZORGER`  |

- **Always `return`** after `next()` in navigation guards — do not copy the teacher router bug.
- Wrong role → `/forbidden` or safe redirect, not silent empty data.

### UI and UX

- Prefer **Nuxt UI** components over custom markup or hand-written Tailwind (exam allows Tailwind via Nuxt UI kit).
- Views stay **thin**; reusable pieces in `components/feature/*` and `components/common/*`.
- Naming: `View{Area}{Name}.vue`, `Feature{Area}{Name}.vue`, `Common{Name}.vue`.
- Forms: validation errors visible; use Zod + Nuxt UI forms when phase requires.
- Async views: **loading, empty, success, error** states mandatory for domain screens.
- **Bezorger screens: mobile-first.**
- Accessibility: keyboard navigation, `aria-label` where needed, respect `prefers-reduced-motion`.

### Composables

Unlike teacher AGENTS (“don't write composables unless instructed”), this exam **expects** composables per architecture: `useFirebase`, `useCustomUser`, `useGraphQL`, `useNotifications`, `useRealtimeConnection`, `useRoleRedirect`. Add new composables when they reduce duplication within the **current phase scope**.

---

## 16. Realtime rules

Realtime must provide **domain value** — not generic “refresh everything.”

| Rule                  | Detail                                                           |
| --------------------- | ---------------------------------------------------------------- |
| Publish after persist | Events fire only after successful DB write                       |
| Apotheker scope       | `apothekerOrderUpdates` filtered by `apothekerProfileId`         |
| Admin scope           | `adminOperationsFeed` requires `ADMIN` role                      |
| Bezorger scope        | `bezorgerRouteUpdates` filtered by `bezorgerProfileId`           |
| No global feed        | Reject unfiltered broadcast subscriptions                        |
| Reconnect             | Refetch authoritative queries (`myOrders`, `myTodayRoute`, etc.) |
| Payload privacy       | No other users’ orders, routes, or stock in events               |

Approved events (architecture §12): order confirmation, delivery update, week-limit warning, admin new-order/low-stock, bezorger route assigned/updated.

---

## 17. PWA rules

- Once Phase 16 introduces PWA: **`vite-plugin-pwa` must remain enabled** — do not disable like teacher demo.
- **Manifest** + **standalone** display mandatory for submission.
- Service worker precaches **static app shell only** (JS, CSS, HTML, icons).
- **Do not cache** authenticated GraphQL responses in mandatory MVP.
- **No offline mutation queue.**
- **No authenticated courier-route caching** until optional backlog explicitly approved.
- Show **update available** prompt when new SW waits.
- Show **offline fallback** (`/offline.html`) for failed navigations — not a blank screen.

---

## 18. Database and seed rules

- Follow architecture embedded/reference choices (embedded order lines, snapshot delivery stops, separate profiles).
- **No client-generated ownership IDs** in entities.
- **No destructive reset** on normal API startup.
- Seed via **explicit CLI** (`npm run seed:database:all`) — not automatic on every boot.
- Seed must be **idempotent** (upsert by email, vaccine code, natural keys).
- Demo accounts documented as **evaluation only**; passwords in README, not production secrets.
- Running seed twice must **not duplicate** users, orders, or routes.
- Index changes (e.g. unique `(bezorgerProfileId, deliveryDate)`) documented in phase report.

### Accepted MVP limitation

**Simultaneous order limit race** (two concurrent submits both passing pre-insert check) is documented in architecture. Do **not** “fix” with lock documents, counter collections, or assumed MongoDB **multi-document transactions** on default single-node Docker Mongo unless architecture and user explicitly approve a later hardening phase.

---

## 19. Testing rules

### Coverage expectations by layer

| Layer         | Expectation                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Unit          | Policies (`DeliveryDatePolicy`, `OrderLimitService`), FSM, `StockService`, route generation/preview |
| Integration   | GraphQL mutations with Supertest                                                                    |
| Authz         | Negative tests — wrong role, wrong owner                                                            |
| Subscriptions | WS auth + filter rejection                                                                          |
| Playwright    | Login, order flow, limit error, role redirect, PWA check (per roadmap phases)                       |

### Rules

- **Unlike teacher `AGENTS.md`**, exam agents **may create and modify `*.spec.ts`** when the roadmap phase requires tests.
- **Do not delete or skip** failing tests to complete a phase.
- **Do not weaken** production auth or validation only to make tests pass — fix tests properly or fix implementation.
- Avoid arbitrary `sleep()` in tests; use deterministic waits or API readiness checks.
- Playwright: prefer `getByRole`, `getByLabel`, or stable `data-testid` attributes.
- **Run test commands required by the current phase** before claiming completion.
- Report tests **not run** with reason (missing Firebase, no Docker, etc.).

---

## 20. Docker and configuration rules

- Use **environment variables** for URLs: `URL_FRONTEND`, `VITE_BACKEND_URL`, `VITE_BACKEND_WS_URL`, `DB_HOST`.
- **No machine-specific paths** to Firebase credentials in Compose or source.
- Mount Firebase Admin JSON via **env path or Docker secret** — gitignored.
- **Public Firebase browser config** (`VITE_FIREBASE_*`) is not a secret — still use env for deployment flexibility.
- **Never commit** production credentials, service accounts, or real `.env`.
- Dockerfiles: **multi-stage** builds per architecture §16.
- **Seed in container** is manual documented step after stack up — not on every restart.
- Verify **WebSocket** through nginx/production stack in Phase 19+.
- Dev: API + PWA on host with mongo in Compose is acceptable until Phase 19.

---

## 21. Generated files

| Artifact                             | Generated by                              | Manual edit          |
| ------------------------------------ | ----------------------------------------- | -------------------- |
| `packages/api/dist/schema.gql`       | NestJS GraphQL build / `generate:graphql` | **Forbidden**        |
| `packages/types/dist/graphql.d.ts`   | GraphQL Code Generator                    | **Forbidden**        |
| `packages/api/dist/**` (compiled JS) | `nest build`                              | **Forbidden**        |
| `packages/pwa/dist/**`               | `vite build`                              | **Forbidden**        |
| Coverage / Playwright reports        | test runners                              | **Forbidden** in Git |

Keep generated output **gitignored** unless course submission explicitly requires committed schema (default: **ignore** per ADR-018).

After schema or operation changes, agents must run **`npm run generate:graphql`** and report the result.

---

## 22. Documentation and traceability

### When to update docs

Update applicable documentation in the **same phase** when behaviour, env vars, seed, or commands change:

- `README.md` (incrementally from Phase 0 placeholder through Phase 33)
- Phase completion notes if student maintains a project dossier

### Traceability requirement

Every substantial implementation must cite:

- **Roadmap phase** (e.g. Phase 7)
- **Architecture section** (e.g. §7 OrderService)
- **Requirement IDs** (e.g. RULE-005, API-015)

### README end-state must include

Installation, env setup, Firebase console steps, codegen workflow, MongoDB, seed order, dev commands, Docker commands, test commands, evaluation accounts (demo disclaimer), known limitations (including concurrent order race).

---

## 23. Oral-exam explainability

Agents must write code the **student can explain** in a live exam.

### Prefer

- Clear service names matching domain language
- Explicit state machines over stringly-typed status hacks
- Small functions with obvious control flow
- Comments only for non-obvious policy (timezone, idempotency)

### Avoid

- Clever meta-programming, deep generic abstractions, or “framework inside the framework”
- Copy-pasted blocks the student cannot describe
- Hidden magic in guards or decorators without corresponding tests

### Each phase completion report must include

- **Concepts to understand** (2–5 bullets)
- **Non-obvious decisions** made in this phase
- **Likely oral questions** examiners might ask
- **Files worth manual review** before commit

If an abstraction cannot be explained in plain language in under two minutes, **simplify it**.

---

## 24. Task completion template

Agents **must** use this template for every implementation task.

### Before implementation

```
### Before implementation

- Phase:
- Objective:
- Files expected to change:
- Dependencies expected:
- Commands planned:
- Architecture sections:
- Requirement IDs:
- Risks/questions:
```

### After implementation

```
### After implementation

- Files created:
- Files modified:
- Dependencies changed:
- Commands actually run:
- Command results:
- Tests passed:
- Tests failed:
- Tests not run:
- Requirements satisfied:
- Deferred work:
- Known limitations:
- Oral-exam concepts:
- Recommended commit message:
```

---

## 25. Prohibited behaviour

Agents must **never**:

1. Implement **multiple roadmap phases** in one task without explicit user permission.
2. **Copy** source files from `bearspray-2025-demo/` or include Bear Spray domain.
3. **Silently change** architecture, FSM, or business rules contrary to approved docs.
4. **Invent requirements** not traceable to approved sources.
5. **Hide type errors** with `any`, `@ts-ignore`, or bogus casts.
6. **Disable, delete, or skip** failing tests to claim phase completion.
7. **Claim** commands or tests passed without executing them.
8. **Commit secrets**, service accounts, or `.env` files.
9. **Weaken authorization** (remove guards, trust client IDs) for convenience.
10. Add **out-of-phase Tier C / optional extras** (i18n before Phase 23, rate limiting before Phase 22, Sentry, K8s, etc.) unless the active roadmap phase explicitly includes them.
11. Perform **unrelated refactors** outside the current phase scope.
12. Proceed past a **global stop condition** (failing CI, broken authz, teacher code in repo).
13. **Disable PWA** or service worker after Phase 16 without user approval.
14. Implement **PKCE** or alternate auth unless explicitly requested.
15. Use **multi-document MongoDB transactions** on default single-node setup without approved architecture change.
16. Add **offline mutation queues** or cache authenticated GraphQL in the service worker.
17. Create **`OperationsService`** or equivalent god-service anti-pattern.
18. Reproduce teacher demo **authorization TODOs** or missing ownership checks.
19. **Initialize npm / install dependencies / create application code** when the user asked for documentation or rules only.
