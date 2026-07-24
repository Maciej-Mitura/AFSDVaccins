# Project Architecture — Vaccinatie-levering

Technical architecture for the AFSD exam project **Vaccinatie-levering**, a digital platform for vaccine ordering and delivery route management. The application will be built **from scratch** in `examAfsdMaciejMitura/` using course-aligned patterns from the read-only teacher reference (`bearspray-2025-demo`, branch `develop` @ `ad691e3`).

**Evidence hierarchy:** `project-fiche.md` → `description.md` → `requirements-matrix.md` → course material → teacher reference (patterns only).

**Status:** Architecture design — ready for implementation roadmap after approval.

---

## 1. Architecture status and assumptions

### 1.1 Provisional policies (configurable — not hardcoded business constants)

These values are **domain policy settings** stored in `OperationalSettings` and/or environment configuration. They may be changed without schema migration beyond the settings document.

| Policy                         | Provisional default                  | Configuration surface                                       | Notes                                                                 |
| ------------------------------ | ------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Timezone                       | `Europe/Brussels`                    | `OperationalSettings.timezone` + `TZ` env                   | All closing-time and delivery-date calculations use this zone         |
| Week window                    | ISO week, Monday–Sunday              | `OperationalSettings.weekStartsOn` (default `MONDAY`)       | Weekly 200-dose cap aggregates within ISO week in configured timezone |
| Closing time (`sluitingstijd`) | `14:00`                              | `OperationalSettings.closingTimeLocal` + seed               | Order before closing → same-day delivery; after → next day            |
| Weekly warning threshold       | 90% of weekly cap                    | `OperationalSettings.weeklyWarningPercent` (default `0.90`) | Triggers apotheker notification before hard block at 200              |
| Weekly dose cap                | 200 (from fiche)                     | `OperationalSettings.weeklyDoseCap`                         | Fiche rule; exposed as policy for testability                         |
| Daily dose cap per type        | 50 (from fiche)                      | `OperationalSettings.dailyDoseCapPerType`                   | Fiche rule                                                            |
| Low-stock threshold            | Per vaccine type                     | `Vaccine.lowStockThreshold`                                 | Admin warning when `stockQuantity <= threshold`                       |
| Delivery status mutation       | Admin initially                      | `OrderService.updateStatus` role guard                      | Architecture allows bezorger transitions later without schema change  |
| Stock decrement                | On `DELIVERED`, not on submit        | `StockService.decrementForDeliveredOrder`                   | Idempotent — see §7                                                   |
| Frontend topology              | One Vue PWA, three role route groups | Router layout config                                        | Not three separate apps                                               |
| Authentication                 | Firebase email/password              | Firebase project config                                     | **No PKCE** unless OAuth authorization-code provider is added         |
| PKCE                           | Not used (default)                   | Auth module feature flag                                    | Required by checklist only for OAuth authorization-code flows         |

All policies above are marked **configurable** in seed data, GraphQL admin settings (where appropriate), and `.env.example` documentation.

### 1.2 Architecture readiness

| Stage                     | Status                                 |
| ------------------------- | -------------------------------------- |
| Domain analysis           | Complete (`project-fiche-analysis.md`) |
| Requirements analysis     | Complete (`requirements-matrix.md`)    |
| Architecture design       | **This document**                      |
| Implementation roadmap    | After architecture approval            |
| Repository initialization | After roadmap approval                 |

---

## 2. Architectural baseline

### 2.1 Selected stack

| Technology / pattern                         | Classification                      | Rationale                                                   |
| -------------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| **npm workspaces monorepo**                  | Course-aligned architectural choice | Course topic + bonus; reference demo pattern                |
| **`packages/api`**                           | Course-aligned architectural choice | Separation of backend concerns                              |
| **`packages/pwa`**                           | Course-aligned architectural choice | Single installable client for all roles                     |
| **`packages/types`**                         | Course-aligned architectural choice | GraphQL Code Generator shared contract (Issues #30–#31)     |
| **`infrastructure/`**                        | Course-aligned architectural choice | Docker Compose per reference + presentation requirement     |
| **Root Playwright tests**                    | Mandatory assignment requirement    | Frontend integration test in deployment pipeline            |
| **GitHub Actions**                           | Mandatory assignment requirement    | API + frontend tests in CI (`description.md`)               |
| **NestJS**                                   | Mandatory assignment requirement    | Backend checklist                                           |
| **Code-first GraphQL**                       | Mandatory assignment requirement    | “Voornamelijk GraphQL”                                      |
| **MongoDB with TypeORM**                     | Mandatory assignment requirement    | Backend checklist L64                                       |
| **Vue 3, Vite, TypeScript, Composition API** | Mandatory assignment requirement    | Frontend checklist                                          |
| **Nuxt UI**                                  | Course-aligned architectural choice | Reference demo; satisfies Tailwind/UnoCSS via component kit |
| **Apollo Client**                            | Course-aligned architectural choice | Course demos; HTTP + WS split                               |
| **Firebase client + Admin SDK**              | Mandatory assignment requirement    | Auth checklist                                              |
| **GraphQL Code Generator**                   | Course-aligned architectural choice | Shared typed operations                                     |
| **GraphQL subscriptions (`graphql-ws`)**     | Mandatory assignment requirement    | Realtime focus + rubric                                     |
| **Docker Compose**                           | Mandatory assignment requirement    | Full stack in containers for presentation                   |
| **Jest, Supertest, Playwright**              | Mandatory / strongly expected       | Backend tests + ≥1 frontend integration test                |
| **Lerna**                                    | Optional quality enhancement        | Reference uses it; workspaces-only scripts acceptable       |
| **class-validator / ValidationPipe**         | Course-aligned architectural choice | Rubric entity validation band                               |
| **nestjs-command seed CLI**                  | Mandatory assignment requirement    | Reproducible demo seeding                                   |
| **Zod + Nuxt UI forms**                      | Optional quality enhancement        | Reference pattern for client validation                     |
| **Firebase Auth emulator**                   | Optional quality enhancement        | CI convenience (Issue #51)                                  |
| **MongoMemoryServer**                        | Optional quality enhancement        | CI test isolation                                           |
| **Runtime i18n (vue-i18n)**                  | Optional quality enhancement        | Phase 23 complete (nl/en/zh/es; FRONT-018); see README i18n |
| **Vitest unit tests**                        | Optional quality enhancement        | Explicit “extra” in checklist                               |
| **PKCE**                                     | Not required (default)              | Firebase email/password does not use PKCE                   |

### 2.1a i18n pointer

Runtime internationalization is documented in the exam **README** (section **i18n (Phase 23 complete — FRONT-018)**) and tracked as Phase **23A–23C** in [implementation-roadmap.md](./implementation-roadmap.md). Summary: Google Sheet SoT → `npm run export:i18n` → committed JSON → `vue-i18n`; no Google in the PWA runtime; locale key `vaccin-delivery:locale`. Architecture does not duplicate the full workflow here.

### 2.2 Package scope

| Package | npm name                 |
| ------- | ------------------------ |
| API     | `@vaccin-delivery/api`   |
| PWA     | `@vaccin-delivery/pwa`   |
| Types   | `@vaccin-delivery/types` |

---

## 3. Repository structure

The exam Git repository root is `examAfsdMaciejMitura/`. Workspace-level research documents (`docs/` in the parent workspace) and `bearspray-2025-demo/` are **not** included in the submitted application repository.

```
examAfsdMaciejMitura/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── hulp-docent.md
│   └── workflows/
│       ├── ci-api.yml                 # Phase 1: lint, typecheck, unit tests
│       ├── ci-pwa.yml                 # Phase 2: lint, typecheck, build
│       ├── ci-api-e2e.yml             # Phase 3: Supertest GraphQL E2E
│       ├── ci-playwright.yml          # Phase 4: Playwright integration
│       └── ci-docker-smoke.yml        # Phase 5: Compose build + health checks
├── .nvmrc
├── .gitignore
├── .prettierrc.json                   # or root package.json prettier block
├── AGENTS.md                          # Exam-specific contributor/agent rules
├── README.md                          # Clone-to-run, env, Firebase, seed, Docker
├── package.json                       # workspaces, root scripts
├── package-lock.json                  # single lockfile strategy
├── playwright.config.ts
├── tests/
│   ├── auth.spec.ts                   # Playwright: register/login flow
│   ├── apotheker-order.spec.ts        # Meaningful integration flow
│   └── pwa-install.spec.ts            # PWA installability / SW registration
├── infrastructure/
│   ├── docker-compose-dev.yml         # MongoDB only (local dev)
│   ├── docker-compose-production.yml  # mongo + api + pwa(nginx)
│   └── nginx/
│       └── default.conf               # optional split from pwa package
├── packages/
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   ├── package.json
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── jest.config.js
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── cli.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   │   └── current-user.decorator.ts
│   │   │   │   ├── entities/
│   │   │   │   │   ├── address.embed.ts
│   │   │   │   │   ├── client-message.entity.ts
│   │   │   │   │   └── audit-timestamps.embed.ts
│   │   │   │   ├── enums/
│   │   │   │   │   └── role.enum.ts
│   │   │   │   ├── filters/
│   │   │   │   │   └── graphql-exception.filter.ts
│   │   │   │   ├── guards/
│   │   │   │   │   ├── authorization.guard.ts
│   │   │   │   │   ├── roles.guard.ts
│   │   │   │   │   └── ownership.guard.ts
│   │   │   │   ├── pubsub/
│   │   │   │   │   └── pubsub.module.ts
│   │   │   │   └── utils/
│   │   │   │       ├── date.util.ts
│   │   │   │       └── mongo.util.ts
│   │   │   ├── authentication/
│   │   │   │   ├── authentication.module.ts
│   │   │   │   ├── firebase.service.ts
│   │   │   │   └── firebase.auth.strategy.ts
│   │   │   ├── users/
│   │   │   │   ├── users.module.ts
│   │   │   │   ├── users.resolver.ts
│   │   │   │   ├── users.service.ts
│   │   │   │   ├── entities/
│   │   │   │   │   ├── user.entity.ts
│   │   │   │   │   ├── apotheker-profile.entity.ts
│   │   │   │   │   └── bezorger-profile.entity.ts
│   │   │   │   ├── dto/
│   │   │   │   └── enums/
│   │   │   ├── vaccines/
│   │   │   │   ├── vaccines.module.ts
│   │   │   │   ├── vaccines.resolver.ts
│   │   │   │   ├── vaccines.service.ts
│   │   │   │   └── entities/vaccine.entity.ts
│   │   │   ├── orders/
│   │   │   │   ├── orders.module.ts
│   │   │   │   ├── orders.resolver.ts
│   │   │   │   ├── orders.service.ts
│   │   │   │   ├── order-limit.service.ts
│   │   │   │   ├── weekly-usage.service.ts
│   │   │   │   ├── delivery-date.policy.ts
│   │   │   │   ├── entities/
│   │   │   │   │   ├── order.entity.ts
│   │   │   │   │   ├── order-line.embed.ts
│   │   │   │   │   └── order-status-history.embed.ts
│   │   │   │   ├── dto/
│   │   │   │   └── enums/order-status.enum.ts
│   │   │   ├── stock/
│   │   │   │   ├── stock.module.ts
│   │   │   │   ├── stock.resolver.ts
│   │   │   │   ├── stock.service.ts
│   │   │   │   └── entities/stock-adjustment.entity.ts
│   │   │   ├── route-templates/
│   │   │   │   ├── route-templates.module.ts
│   │   │   │   ├── route-templates.resolver.ts
│   │   │   │   ├── route-templates.service.ts
│   │   │   │   └── entities/
│   │   │   │       ├── route-template.entity.ts
│   │   │   │       └── route-template-stop.embed.ts
│   │   │   ├── routes/
│   │   │   │   ├── routes.module.ts
│   │   │   │   ├── routes.resolver.ts
│   │   │   │   ├── routes.service.ts
│   │   │   │   ├── route-generation.service.ts
│   │   │   │   ├── route-preview.service.ts
│   │   │   │   └── entities/
│   │   │   │       ├── delivery-route.entity.ts
│   │   │   │       ├── delivery-stop.embed.ts
│   │   │   │       └── route-status-history.embed.ts
│   │   │   ├── notifications/
│   │   │   │   ├── notifications.module.ts
│   │   │   │   ├── notifications.resolver.ts
│   │   │   │   ├── notifications.service.ts
│   │   │   │   └── entities/notification.entity.ts
│   │   │   ├── settings/
│   │   │   │   ├── settings.module.ts
│   │   │   │   ├── settings.resolver.ts
│   │   │   │   ├── settings.service.ts
│   │   │   │   └── entities/operational-settings.entity.ts
│   │   │   └── seed/
│   │   │       ├── seed.module.ts
│   │   │       ├── seed.command.ts
│   │   │       ├── seed.service.ts
│   │   │       └── data/
│   │   │           ├── users.json
│   │   │           ├── vaccines.json
│   │   │           ├── orders.json
│   │   │           ├── route-templates.json
│   │   │           └── settings.json
│   │   ├── test/
│   │   │   ├── app.e2e-spec.ts
│   │   │   ├── orders.e2e-spec.ts
│   │   │   ├── subscriptions.e2e-spec.ts
│   │   │   ├── authz.e2e-spec.ts
│   │   │   └── firebase.auth.strategy.mock.ts
│   │   └── dist/
│   │       └── schema.gql                 # generated — see §3.2
│   ├── pwa/
│   │   ├── Dockerfile
│   │   ├── nginx.conf
│   │   ├── .env.example
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── tsconfig.app.json
│   │   ├── tsconfig.node.json
│   │   ├── index.html
│   │   ├── public/
│   │   │   ├── favicon.svg
│   │   │   ├── icons/                     # PWA icons 192/512
│   │   │   └── robots.txt
│   │   └── src/
│   │       ├── main.ts
│   │       ├── App.vue
│   │       ├── env.d.ts
│   │       ├── router/
│   │       │   └── index.ts
│   │       ├── composables/
│   │       │   ├── useFirebase.ts
│   │       │   ├── useCustomUser.ts
│   │       │   ├── useGraphQL.ts
│   │       │   ├── useNotifications.ts
│   │       │   ├── useRealtimeConnection.ts
│   │       │   └── useRoleRedirect.ts
│   │       ├── assets/
│   │       │   ├── main.css
│   │       │   └── graphql/
│   │       │       ├── user.query.ts
│   │       │       ├── user.mutation.ts
│   │       │       ├── orders.query.ts
│   │       │       ├── orders.mutation.ts
│   │       │       ├── orders.subscription.ts
│   │       │       ├── vaccines.query.ts
│   │       │       ├── stock.query.ts
│   │       │       ├── stock.mutation.ts
│   │       │       ├── routes.query.ts
│   │       │       ├── routes.mutation.ts
│   │       │       ├── routes.subscription.ts
│   │       │       ├── route-templates.query.ts
│   │       │       ├── route-templates.mutation.ts
│   │       │       ├── admin.query.ts
│   │       │       └── notifications.subscription.ts
│   │       ├── components/
│   │       │   ├── common/
│   │       │   │   ├── CommonHeader.vue
│   │       │   │   ├── CommonEmptyState.vue
│   │       │   │   ├── CommonLoadingSkeleton.vue
│   │       │   │   ├── CommonPermissionDenied.vue
│   │       │   │   └── CommonOfflineBanner.vue
│   │       │   └── feature/
│   │       │       ├── auth/
│   │       │       ├── apotheker/
│   │       │       ├── admin/
│   │       │       └── bezorger/
│   │       └── views/
│   │           ├── auth/
│   │           ├── apotheker/
│   │           ├── admin/
│   │           ├── bezorger/
│   │           └── generic/
│   └── types/
│       ├── package.json
│       ├── src/
│       │   └── codegen.ts
│       └── dist/
│           └── graphql.d.ts               # generated — see §3.2
└── firebase-service-account.json.example  # never commit real file
```

### 3.1 Root scripts (intended)

| Script              | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `dev`               | Parallel `@vaccin-delivery/api` + `@vaccin-delivery/pwa` dev servers |
| `dev:api`           | Nest watch mode (**scoped to api**, not pwa — fix reference defect)  |
| `dev:pwa`           | Vite dev server                                                      |
| `build`             | Build api + pwa + types (runs `generate:graphql` first)              |
| `test`              | Jest unit tests in api                                               |
| `test:e2e`          | Supertest GraphQL E2E                                                |
| `test:playwright`   | Root Playwright suite                                                |
| `seed:database:all` | Idempotent seed via nestjs-command                                   |
| `generate:graphql`  | Emit `schema.gql` + codegen to `@vaccin-delivery/types`              |
| `lint`              | ESLint across packages                                               |

### 3.2 Generated artifacts

These files are **produced by scripts** and **must not be manually authored**:

| Artifact                           | Producer                                                       | Committed?          |
| ---------------------------------- | -------------------------------------------------------------- | ------------------- |
| `packages/api/dist/schema.gql`     | NestJS GraphQL schema emission on `build` / `generate:graphql` | **No — gitignored** |
| `packages/types/dist/graphql.d.ts` | GraphQL Code Generator (`npm run generate:graphql`)            | **No — gitignored** |

**Architecture decision:** ignore generated output in Git. CI and local builds regenerate them via `generate:graphql` before typecheck/build. The PWA imports `@vaccin-delivery/types` from the workspace package after codegen runs in the build pipeline. If course submission explicitly requires committed schema output, revisit this decision in the roadmap — default remains **ignore**.

`.gitignore` entries: `packages/api/dist/`, `packages/types/dist/`.

---

## 4. Domain modules

NestJS modules follow **resolver → service → entity** with one bounded context per module. Cross-module calls go through exported services, not direct repository access from foreign resolvers.

| Module              | Responsibility                                                                                                                          | Boundaries                                                                                                                                               | Key exports                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **authentication**  | Firebase Admin verification, Passport bearer strategy, WebSocket `onConnect` token extraction                                           | No domain data; provides guards and `FirebaseService`                                                                                                    | `AuthorizationGuard`, `FirebaseService`                                          |
| **users**           | Application `User`, role assignment, profile CRUD for apotheker/bezorger                                                                | Owns identity linkage (`external_uid`); does not place orders or generate routes                                                                         | `UsersService`, profile entities                                                 |
| **vaccines**        | Catalog of exactly three orderable vaccine types; read for all authenticated roles; admin metadata                                      | Does not mutate stock quantities (stock module)                                                                                                          | `VaccinesService`                                                                |
| **orders**          | Order placement, limit validation, status transitions, apotheker history, weekly usage queries                                          | Delegates stock decrement to stock module on delivery; publishes order events                                                                            | `OrdersService`, `OrderLimitService`, `WeeklyUsageService`, `DeliveryDatePolicy` |
| **stock**           | **Authoritative** `Vaccine.stockQuantity`; immutable `StockAdjustment` audit log; admin adjustments and idempotent delivery decrement   | **Only `StockService` may modify `stockQuantity`**. Every change updates balance + creates audit record in one operation. Does not validate order limits | `StockService`                                                                   |
| **route-templates** | Reusable stop sequences, template–bezorger assignment                                                                                   | Templates are plans, not executed routes                                                                                                                 | `RouteTemplatesService`                                                          |
| **routes**          | Persisted `DeliveryRoute` generation/assignment, bezorger today route, **computed `RoutePreview` for tomorrow**, route status lifecycle | `myTodayRoute` → persisted entity; `myTomorrowRoutePreview` → computed only                                                                              | `RoutesService`, `RouteGenerationService`, `RoutePreviewService`                 |
| **notifications**   | Persisted notification records + PubSub fan-out for realtime UX                                                                         | Does not implement business rules; consumes events from orders/stock/routes                                                                              | `NotificationsService`                                                           |
| **settings**        | Operational policies (closing time, caps, timezone, warning %)                                                                          | Single settings document; admin-readable                                                                                                                 | `SettingsService`, `DeliveryDatePolicy` input                                    |
| **seed**            | Idempotent Firebase + MongoDB seed for demo and tests                                                                                   | CLI only; not imported by runtime request path except via command                                                                                        | `SeedService`, `SeedCommand`                                                     |

| **Anti-pattern avoided:** one monolithic `OperationsService` handling orders, routes, stock, and notifications. Each service stays focused; orchestration for “mark delivered” lives in `OrderService` calling `StockService` (which alone writes `stockQuantity`) and `NotificationsService`.

---

## 5. Domain model

MongoDB via TypeORM. Primary keys are `ObjectId` strings exposed as GraphQL `ID`. Embedded subdocuments use `@Column(() => Embed)` pattern from reference demo.

### 5.1 Modelling decisions (justification)

| Decision                 | Choice                                                                                                                      | Reason                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Order lines**          | **Embedded** in `Order`                                                                                                     | Lines are always read/written with parent order; no independent lifecycle; simplifies limit aggregation queries                                          |
| **Route template stops** | **Embedded** with `apothekerProfileId` reference                                                                            | Stop order is template-local; apotheker profile resolved via field resolver when needed                                                                  |
| **Delivery stops**       | **Embedded snapshot** in `DeliveryRoute`                                                                                    | Courier sees address/quantities as they were at route generation; pharmacy address or order changes later do not rewrite historical routes               |
| **Profiles**             | **Separate entities** (`ApothekerProfile`, `BezorgerProfile`) linked from `User`                                            | Apotheker has pharmacy address and name; bezorger has driver metadata; admin has no profile; avoids bloating `User` and supports FK integrity for routes |
| **Route snapshots**      | Copy `Address`, pharmacy name, and aggregated line quantities into `DeliveryStop` at generation                             | Historical accuracy for persisted routes; explains skipped template stops via `skippedStops` audit array                                                 |
| **Tomorrow preview**     | **`RoutePreview` GraphQL type — not persisted**                                                                             | Computed on read from template + qualifying orders; becomes `DeliveryRoute` only after admin generation                                                  |
| **Audit timestamps**     | `@CreateDateColumn` / `@UpdateDateColumn` on all root entities; `OrderStatusHistory` / `RouteStatusHistory` embedded arrays | Supports admin tracking and idempotent transition checks                                                                                                 |
| **Status history**       | Embedded arrays on `Order` and `DeliveryRoute`                                                                              | Small bounded history; no separate collection needed for MVP                                                                                             |
| **Soft deletion**        | **`archivedAt` on `User` and `RouteTemplate` only**; orders use `CANCELLED` status, not delete                              | Preserves order history for week stats; templates archived instead of hard-deleted if referenced                                                         |

### 5.2 Entity specifications

#### User

| Field                     | Type      | Required    | Unique/indexed | Embedded/ref | Mutable    | Ownership  | Reason                 |
| ------------------------- | --------- | ----------- | -------------- | ------------ | ---------- | ---------- | ---------------------- |
| `id`                      | ObjectId  | yes         | PK             | root         | no         | system     | Primary key            |
| `external_uid`            | string    | yes         | unique         | root         | no         | system     | Firebase UID linkage   |
| `email`                   | string    | yes         | unique         | root         | yes        | self/admin | Display + seed         |
| `role`                    | Role enum | yes         | index          | root         | admin-only | system     | AUTHZ                  |
| `locale`                  | string    | no          | —              | root         | yes        | self       | UX (optional i18n)     |
| `apothekerProfileId`      | ObjectId  | conditional | index          | ref          | admin      | apotheker  | FK when role=APOTHEKER |
| `bezorgerProfileId`       | ObjectId  | conditional | index          | ref          | admin      | bezorger   | FK when role=BEZORGER  |
| `archivedAt`              | Date      | no          | —              | root         | admin      | system     | Soft archive           |
| `createdAt` / `updatedAt` | Date      | yes         | —              | embed        | no         | system     | Audit                  |

#### ApothekerProfile

| Field                     | Type     | Required | Unique/indexed | Embedded/ref | Mutable | Ownership       | Reason                      |
| ------------------------- | -------- | -------- | -------------- | ------------ | ------- | --------------- | --------------------------- |
| `id`                      | ObjectId | yes      | PK             | root         | no      | system          | FK from User, orders, stops |
| `pharmacyName`            | string   | yes      | —              | root         | yes     | admin/apotheker | Display on routes           |
| `address`                 | Address  | yes      | —              | embed        | yes     | apotheker/admin | Delivery stop address       |
| `phone`                   | string   | no       | —              | root         | yes     | apotheker       | Contact                     |
| `createdAt` / `updatedAt` | Date     | yes      | —              | embed        | no      | system          | Audit                       |

#### BezorgerProfile

| Field                     | Type     | Required | Unique/indexed | Embedded/ref | Mutable | Ownership      | Reason                |
| ------------------------- | -------- | -------- | -------------- | ------------ | ------- | -------------- | --------------------- |
| `id`                      | ObjectId | yes      | PK             | root         | no      | system         | FK from User, routes  |
| `displayName`             | string   | yes      | —              | root         | yes     | bezorger/admin | UI label              |
| `vehicleLabel`            | string   | no       | —              | root         | yes     | bezorger/admin | Optional ops metadata |
| `createdAt` / `updatedAt` | Date     | yes      | —              | embed        | no      | system         | Audit                 |

#### Address (embedded value object)

| Field        | Type   | Required | Unique/indexed | Embedded/ref | Mutable | Ownership     | Reason        |
| ------------ | ------ | -------- | -------------- | ------------ | ------- | ------------- | ------------- |
| `street`     | string | yes      | —              | embed        | yes     | profile owner | Route display |
| `postalCode` | string | yes      | —              | embed        | yes     | profile owner |               |
| `city`       | string | yes      | —              | embed        | yes     | profile owner |               |
| `country`    | string | yes      | default `BE`   | embed        | yes     | profile owner |               |

#### Vaccine

| Field                     | Type     | Required | Unique/indexed | Embedded/ref | Mutable | Ownership             | Reason                                                                   |
| ------------------------- | -------- | -------- | -------------- | ------------ | ------- | --------------------- | ------------------------------------------------------------------------ |
| `id`                      | ObjectId | yes      | PK             | root         | no      | system                | Catalog entry                                                            |
| `code`                    | string   | yes      | unique         | root         | no      | admin                 | Stable seed key (`FLU`, `COVID`, `MMR`)                                  |
| `name`                    | string   | yes      | —              | root         | yes     | admin                 | Display                                                                  |
| `description`             | string   | no       | —              | root         | yes     | admin                 | UI                                                                       |
| `stockQuantity`           | int      | yes      | —              | root         | yes     | **StockService only** | **Authoritative current balance** — no other module may write this field |
| `lowStockThreshold`       | int      | yes      | —              | root         | yes     | admin                 | Configurable per type                                                    |
| `isActive`                | boolean  | yes      | —              | root         | yes     | admin                 | Ordering guard                                                           |
| `createdAt` / `updatedAt` | Date     | yes      | —              | embed        | no      | system                | Audit                                                                    |

#### Order

| Field                     | Type                            | Required | Unique/indexed | Embedded/ref | Mutable         | Ownership                     | Reason                              |
| ------------------------- | ------------------------------- | -------- | -------------- | ------------ | --------------- | ----------------------------- | ----------------------------------- |
| `id`                      | ObjectId                        | yes      | PK             | root         | no              | system                        |                                     |
| `apothekerProfileId`      | ObjectId                        | yes      | index          | ref          | no              | derived from `@CurrentUser()` | Ownership — never from client input |
| `status`                  | OrderStatus                     | yes      | index          | root         | via service     | apotheker read / admin write  | Lifecycle                           |
| `deliveryDate`            | date (UTC midnight policy date) | yes      | index          | root         | no              | computed                      | Closing-time rules                  |
| `orderedAt`               | Date                            | yes      | index          | root         | no              | system                        | Limit + audit                       |
| `lines`                   | OrderLine[]                     | yes      | —              | **embed**    | no after submit | apotheker                     | Dose breakdown                      |
| `statusHistory`           | OrderStatusHistory[]            | yes      | —              | embed        | append-only     | system                        | Transition audit                    |
| `stockDecrementedAt`      | Date                            | no       | —              | root         | once            | system                        | Idempotency guard                   |
| `expectedDeliveryMessage` | string                          | yes      | —              | root         | no              | computed                      | Notification payload                |
| `createdAt` / `updatedAt` | Date                            | yes      | —              | embed        | no              | system                        | Audit                               |

#### OrderLine (embedded)

| Field           | Type     | Required | Unique/indexed | Embedded/ref | Mutable | Ownership | Reason               |
| --------------- | -------- | -------- | -------------- | ------------ | ------- | --------- | -------------------- |
| `vaccineId`     | ObjectId | yes      | —              | ref id       | no      | apotheker | Catalog FK           |
| `vaccineCode`   | string   | yes      | —              | embed        | no      | snapshot  | Display without join |
| `quantityDoses` | int      | yes      | min 1          | embed        | no      | apotheker | Limit checks         |

#### OrderStatusHistory (embedded)

| Field             | Type        | Required | Unique/indexed | Embedded/ref | Mutable | Ownership | Reason |
| ----------------- | ----------- | -------- | -------------- | ------------ | ------- | --------- | ------ |
| `fromStatus`      | OrderStatus | no       | —              | embed        | no      | system    | Audit  |
| `toStatus`        | OrderStatus | yes      | —              | embed        | no      | system    | Audit  |
| `changedAt`       | Date        | yes      | —              | embed        | no      | system    | Audit  |
| `changedByUserId` | ObjectId    | yes      | —              | ref          | no      | system    | Actor  |

#### StockAdjustment

Immutable audit log. **Never** treated as the source of truth for current stock — always derived from `StockService` operations that update `Vaccine.stockQuantity` and append a record in one atomic service method.

| Field               | Type     | Required | Unique/indexed  | Embedded/ref | Mutable | Ownership | Reason                                                                             |
| ------------------- | -------- | -------- | --------------- | ------------ | ------- | --------- | ---------------------------------------------------------------------------------- |
| `id`                | ObjectId | yes      | PK              | root         | no      | system    | Audit log entry                                                                    |
| `vaccineId`         | ObjectId | yes      | index           | ref          | no      | system    | Which vaccine                                                                      |
| `deltaQuantity`     | int      | yes      | —               | root         | no      | system    | Signed change applied to balance                                                   |
| `balanceAfter`      | int      | yes      | —               | root         | no      | system    | Snapshot of `stockQuantity` after adjustment                                       |
| `reason`            | enum     | yes      | —               | root         | no      | system    | `PURCHASE`, `MANUAL_CORRECTION`, `DELIVERY_DECREMENT`                              |
| `orderId`           | ObjectId | no       | index           | ref          | no      | system    | Links delivery decrement                                                           |
| `idempotencyKey`    | string   | no       | unique (sparse) | root         | no      | system    | Delivery decrement: `delivery-decrement:{orderId}` — prevents duplicate audit rows |
| `performedByUserId` | ObjectId | yes      | —               | ref          | no      | system    | Actor                                                                              |
| `createdAt`         | Date     | yes      | —               | root         | no      | system    | Audit                                                                              |

#### RoutePreview (computed — not persisted)

GraphQL object type only. Built by `RoutePreviewService` (in `routes` module) at query time.

| Field                        | Type               | Required | Notes                                    |
| ---------------------------- | ------------------ | -------- | ---------------------------------------- |
| `deliveryDate`               | date               | yes      | Tomorrow (local policy date)             |
| `bezorgerProfileId`          | ObjectId           | yes      | From assigned template                   |
| `routeTemplateId`            | ObjectId           | yes      | Bezorger's linked template               |
| `stops`                      | RoutePreviewStop[] | yes      | Pharmacies with qualifying orders only   |
| `skippedApothekerProfileIds` | ObjectId[]         | no       | Template stops without qualifying orders |
| `computedAt`                 | DateTime           | yes      | When preview was calculated              |

#### RoutePreviewStop (embedded in RoutePreview response)

| Field                | Type                | Required | Notes                             |
| -------------------- | ------------------- | -------- | --------------------------------- |
| `sequence`           | int                 | yes      | Stop order from template          |
| `apothekerProfileId` | ObjectId            | yes      | Pharmacy reference                |
| `pharmacyName`       | string              | yes      | From live profile                 |
| `address`            | Address             | yes      | From live profile                 |
| `lines`              | OrderLineSnapshot[] | yes      | Aggregated from qualifying orders |
| `orderIds`           | ObjectId[]          | yes      | Source orders included in preview |

#### RouteTemplate

| Field                     | Type                | Required | Unique/indexed | Embedded/ref | Mutable | Ownership | Reason                 |
| ------------------------- | ------------------- | -------- | -------------- | ------------ | ------- | --------- | ---------------------- |
| `id`                      | ObjectId            | yes      | PK             | root         | no      | system    |                        |
| `name`                    | string              | yes      | —              | root         | yes     | admin     |                        |
| `bezorgerProfileId`       | ObjectId            | yes      | index          | ref          | yes     | admin     | Template–bezorger link |
| `stops`                   | RouteTemplateStop[] | yes      | —              | **embed**    | yes     | admin     | Fixed daily stop order |
| `archivedAt`              | Date                | no       | —              | root         | admin   | system    | Soft archive           |
| `createdAt` / `updatedAt` | Date                | yes      | —              | embed        | no      | system    | Audit                  |

#### RouteTemplateStop (embedded)

| Field                | Type     | Required | Unique/indexed | Embedded/ref | Mutable | Ownership | Reason         |
| -------------------- | -------- | -------- | -------------- | ------------ | ------- | --------- | -------------- |
| `sequence`           | int      | yes      | —              | embed        | yes     | admin     | Stop order     |
| `apothekerProfileId` | ObjectId | yes      | —              | ref id       | yes     | admin     | Which pharmacy |

#### DeliveryRoute

| Field                     | Type                 | Required | Unique/indexed               | Embedded/ref       | Mutable     | Ownership      | Reason                          |
| ------------------------- | -------------------- | -------- | ---------------------------- | ------------------ | ----------- | -------------- | ------------------------------- |
| `id`                      | ObjectId             | yes      | PK                           | root               | no          | system         |                                 |
| `bezorgerProfileId`       | ObjectId             | yes      | index                        | ref                | no          | admin assign   | Ownership                       |
| `routeTemplateId`         | ObjectId             | yes      | index                        | ref                | no          | admin          | Provenance                      |
| `deliveryDate`            | date                 | yes      | compound index with bezorger | root               | no          | admin          | Today/tomorrow queries          |
| `status`                  | RouteStatus          | yes      | index                        | root               | via service | admin/bezorger | Lifecycle                       |
| `stops`                   | DeliveryStop[]       | yes      | —                            | **embed snapshot** | regenerate  | admin          | Active deliveries only          |
| `skippedTemplateStopIds`  | ObjectId[]           | no       | —                            | embed              | no          | system         | Audit pharmacies without orders |
| `statusHistory`           | RouteStatusHistory[] | yes      | —                            | embed              | append-only | system         | Audit                           |
| `createdAt` / `updatedAt` | Date                 | yes      | —                            | embed              | no          | system         | Audit                           |

**Index:** unique compound `(bezorgerProfileId, deliveryDate)` — **one route per courier per calendar date**. Regeneration **updates** the existing document's stop snapshot; it does not create a second route for the same pair. A cancelled route occupies the slot until explicitly replaced by regeneration (admin workflow).

#### DeliveryStop (embedded snapshot)

| Field                | Type                | Required | Unique/indexed | Embedded/ref | Mutable | Ownership | Reason                       |
| -------------------- | ------------------- | -------- | -------------- | ------------ | ------- | --------- | ---------------------------- |
| `sequence`           | int                 | yes      | —              | embed        | no      | snapshot  | Stop order                   |
| `apothekerProfileId` | ObjectId            | yes      | —              | ref id       | no      | snapshot  | Link                         |
| `pharmacyName`       | string              | yes      | —              | embed        | no      | snapshot  | Copied at generation         |
| `address`            | Address             | yes      | —              | embed        | no      | snapshot  | Copied at generation         |
| `lines`              | OrderLineSnapshot[] | yes      | —              | embed        | no      | snapshot  | Aggregated doses per vaccine |
| `orderIds`           | ObjectId[]          | yes      | —              | embed        | no      | snapshot  | Source orders for day        |

#### Notification

| Field             | Type             | Required | Unique/indexed | Embedded/ref | Mutable | Ownership | Reason            |
| ----------------- | ---------------- | -------- | -------------- | ------------ | ------- | --------- | ----------------- |
| `id`              | ObjectId         | yes      | PK             | root         | no      | system    |                   |
| `recipientUserId` | ObjectId         | yes      | index          | ref          | no      | system    | Target user       |
| `type`            | NotificationType | yes      | index          | root         | no      | system    | Enum              |
| `title`           | string           | yes      | —              | root         | no      | system    | UI                |
| `body`            | string           | yes      | —              | root         | no      | system    | UI                |
| `payload`         | JSON             | no       | —              | root         | no      | system    | Structured extras |
| `readAt`          | Date             | no       | —              | root         | yes     | recipient | Mark read         |
| `createdAt`       | Date             | yes      | index          | root         | no      | system    | Feed ordering     |

#### OperationalSettings (singleton document)

| Field                  | Type           | Required | Unique/indexed | Embedded/ref | Mutable | Ownership | Reason                    |
| ---------------------- | -------------- | -------- | -------------- | ------------ | ------- | --------- | ------------------------- |
| `id`                   | fixed `global` | yes      | unique         | root         | —       | admin     | Singleton                 |
| `timezone`             | string         | yes      | —              | root         | yes     | admin     | Default `Europe/Brussels` |
| `closingTimeLocal`     | string `HH:mm` | yes      | —              | root         | yes     | admin     | Default `14:00`           |
| `weekStartsOn`         | enum           | yes      | —              | root         | yes     | admin     | ISO Monday                |
| `weeklyDoseCap`        | int            | yes      | —              | root         | yes     | admin     | Default 200               |
| `dailyDoseCapPerType`  | int            | yes      | —              | root         | yes     | admin     | Default 50                |
| `weeklyWarningPercent` | float          | yes      | —              | root         | yes     | admin     | Default 0.90              |
| `updatedAt`            | Date           | yes      | —              | root         | no      | system    | Audit                     |

---

## 6. State machines

### 6.1 Order lifecycle

Initial MVP statuses: `PENDING`, `PLANNED`, `DELIVERED`, `CANCELLED`. **`OUT_FOR_DELIVERY` is deferred** until route-execution workflows justify an extra transition.

```
                    ┌─────────────┐
                    │   PENDING   │  (in behandeling — initial on submit)
                    └──────┬──────┘
           cancel          │ plan (admin route generation)
              ┌────────────┼────────────┐
              ▼            ▼            │
        ┌───────────┐ ┌──────────┐      │
        │ CANCELLED │ │ PLANNED  │      │
        └───────────┘ └────┬─────┘      │
                             │ mark delivered (admin)
                             ▼
                    ┌─────────────┐
                    │  DELIVERED  │
                    └─────────────┘
```

| Transition      | From                     | To          | Actor        | Side effects                                                                            |
| --------------- | ------------------------ | ----------- | ------------ | --------------------------------------------------------------------------------------- |
| `submitOrder`   | —                        | `PENDING`   | apotheker    | Validate limits + closing time; persist; notify apotheker + admin; **no stock change**  |
| `cancelOrder`   | `PENDING`                | `CANCELLED` | admin        | Notify apotheker; excluded from route generation                                        |
| `planOrder`     | `PENDING`                | `PLANNED`   | admin/system | Set when included in generated route for delivery date                                  |
| `markDelivered` | `PLANNED`                | `DELIVERED` | admin        | **StockService** idempotent decrement; **fail if insufficient stock**; notify apotheker |
| `markDelivered` | `PENDING`                | `DELIVERED` | admin        | Allowed shortcut for demo; same stock rules apply                                       |
| _invalid_       | `DELIVERED`, `CANCELLED` | any         | —            | **Rejected** — `BadRequestException`                                                    |
| _invalid_       | any                      | arbitrary   | client       | **Rejected** — no direct status field mutation                                          |

**Idempotency:** `markDelivered` checks current status; if already `DELIVERED`, returns success without second stock decrement (uses `stockDecrementedAt` + `StockAdjustment.idempotencyKey`).

**Mapping to fiche wording:** `PENDING` and `PLANNED` display as _in behandeling_; `DELIVERED` as _geleverd_.

### 6.2 Delivery route lifecycle

Initial MVP statuses: `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. **`DRAFT` is not used** — generation creates or updates an `ASSIGNED` route directly.

```
   ┌──────────┐
   │ ASSIGNED │  (created or updated by admin generation)
   └────┬─────┘
        │ start (bezorger or admin)
        ▼
  ┌─────────────┐
  │ IN_PROGRESS │
  └──────┬──────┘
         │ complete
         ▼
   ┌───────────┐
   │ COMPLETED │
   └───────────┘

   Any non-terminal ──cancel──▶ CANCELLED (admin)
```

| Transition        | From                      | To            | Actor             | Side effects                                                                                                                                      |
| ----------------- | ------------------------- | ------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateRoute`   | — / existing              | `ASSIGNED`    | admin             | Upsert by `(bezorgerProfileId, deliveryDate)`; filter stops without active orders; snapshot stops; set linked orders → `PLANNED`; notify bezorger |
| `startRoute`      | `ASSIGNED`                | `IN_PROGRESS` | bezorger or admin | Timestamp                                                                                                                                         |
| `completeRoute`   | `IN_PROGRESS`             | `COMPLETED`   | bezorger or admin | Admin still marks individual orders `DELIVERED` separately                                                                                        |
| `cancelRoute`     | non-terminal              | `CANCELLED`   | admin             | Notify bezorger                                                                                                                                   |
| `regenerateRoute` | `ASSIGNED` or `CANCELLED` | `ASSIGNED`    | admin             | **Update existing** route document's stop snapshot; publish route update event                                                                    |

---

## 7. Business services

### 7.1 Service responsibilities

| Service                    | Responsibility                                                                                                                     | Collaborators                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **DeliveryDatePolicy**     | Compute `deliveryDate` from `orderedAt` + closing time + timezone; reject retroactive dates                                        | `SettingsService`                                              |
| **OrderLimitService**      | Calculate daily per-type and weekly total totals **immediately before insert**; reject if caps exceeded                            | `WeeklyUsageService`, MongoDB aggregation                      |
| **WeeklyUsageService**     | Sum doses per vaccine and total for apotheker in ISO week window                                                                   | `Order` repository                                             |
| **OrderService**           | **Single focused `placeOrder()` method**: validate → limit check → insert; status transitions; ownership enforcement               | Above + `StockService`, `NotificationsService`, PubSub         |
| **RouteGenerationService** | Build/update persisted `DeliveryRoute` stop list from template ∩ active orders; upsert by `(bezorgerProfileId, deliveryDate)`      | `OrdersService`, `RouteTemplatesService`                       |
| **RoutePreviewService**    | Compute non-persisted `RoutePreview` for tomorrow from template + qualifying orders (before closing rule)                          | `RouteTemplatesService`, `OrdersService`, `DeliveryDatePolicy` |
| **RoutesService**          | Load today's persisted route, route status transitions                                                                             | `RouteGenerationService`, `RoutePreviewService`, PubSub        |
| **StockService**           | **Sole writer of `Vaccine.stockQuantity`**; append immutable `StockAdjustment`; low-stock detection; idempotent delivery decrement | `StockAdjustment` repository, `Vaccine` repository             |
| **NotificationService**    | Persist + publish typed notifications                                                                                              | PubSub                                                         |

#### StockService invariants

1. **`Vaccine.stockQuantity` is the authoritative current balance.**
2. **`StockAdjustment` is an immutable audit log** — never summed to derive balance at runtime.
3. **Only `StockService` may modify `stockQuantity`** (resolvers and other services delegate here).
4. **Every adjustment** runs through one service operation: validate → update balance → append audit row.
5. **Delivery decrement** uses idempotency key `delivery-decrement:{orderId}`.
6. **`markDelivered` fails** with a structured error if any line exceeds available stock.
7. **Duplicate delivered requests** return the existing delivered order without a second decrement.

### 7.2 Concurrency and consistency (initial MVP)

The default development and presentation stack uses a **single-node MongoDB container**. **Do not assume multi-document transactions** are available in that environment.

| Risk                                              | Scenario                                                      | Initial MVP mitigation                                                                                                                                                                                      | Deferred hardening (not initial requirements)                                                          |
| ------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Simultaneous orders exceed daily/weekly limit** | Two requests from same apotheker at the same instant          | `OrderService.placeOrder()` calls `OrderLimitService` to **aggregate existing totals immediately before insert** in one focused method; normal and boundary paths covered by **unit and integration tests** | MongoDB replica-set transactions, counter/reservation documents, optimistic locking, distributed locks |
| **Remaining race**                                | Two concurrent submits both read totals before either inserts | **Documented accepted risk** for MVP: both may pass the pre-insert check; mitigated in practice by low concurrency; hardening options listed above                                                          | Same as left                                                                                           |
| **Double stock decrement**                        | Admin retries `markDelivered`                                 | `Order.stockDecrementedAt` + `StockAdjustment.idempotencyKey`; second call is no-op success                                                                                                                 | —                                                                                                      |
| **Insufficient stock on deliver**                 | Order lines exceed `stockQuantity`                            | `StockService.applyDeliveryDecrement()` validates availability **before** writing; mutation fails with JSON error                                                                                           | —                                                                                                      |
| **Route generation during order changes**         | Admin generates while apotheker submits                       | Generation reads point-in-time orders for `deliveryDate`; regeneration explicitly updates existing route                                                                                                    | —                                                                                                      |
| **Idempotent status transitions**                 | Repeat `markDelivered`                                        | If `status === DELIVERED`, no-op success; history not duplicated                                                                                                                                            | —                                                                                                      |

**Testing obligation:** unit tests for limit boundaries (49→50, 199→200, 201 rejected); integration test for full `placeOrder` flow; document the concurrent-submit race in README architecture notes.

### 7.3 DeliveryDatePolicy (pseudologic)

```
input: orderedAt (instant), settings (timezone, closingTimeLocal)
localTime = orderedAt in settings.timezone
if localTime <= closingTime on same local calendar day:
  deliveryDate = that local calendar day
else:
  deliveryDate = next local calendar day
reject if deliveryDate < today(local)  // RULE-003 retroactive
```

---

## 8. GraphQL contract

Schema is code-first; **`packages/api/dist/schema.gql` is generated** (§3.2) at build and not committed. All protected operations use `@UseGuards(AuthorizationGuard, RolesGuard)` unless noted. **Clients never supply** `apothekerProfileId`, `bezorgerProfileId`, `recipientUserId`, or `role`.

### 8.1 Enums

| Enum                    | Values                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Role`                  | `APOTHEKER`, `ADMIN`, `BEZORGER`                                                                                                 |
| `OrderStatus`           | `PENDING`, `PLANNED`, `DELIVERED`, `CANCELLED`                                                                                   |
| `RouteStatus`           | `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`                                                                              |
| `NotificationType`      | `ORDER_CONFIRMATION`, `DELIVERY_TIME`, `WEEK_LIMIT_WARNING`, `ORDER_DELIVERED`, `LOW_STOCK`, `ROUTE_ASSIGNED`, `NEW_ORDER_ADMIN` |
| `StockAdjustmentReason` | `PURCHASE`, `MANUAL_CORRECTION`, `DELIVERY_DECREMENT`                                                                            |

### 8.2 Object types (summary)

`User`, `ApothekerProfile`, `BezorgerProfile`, `Address`, `Vaccine`, `Order`, `OrderLine`, `WeeklyUsageSummary`, `VaccineUsage`, `StockAdjustment`, `RouteTemplate`, `RouteTemplateStop`, `DeliveryRoute`, `DeliveryStop`, **`RoutePreview`**, **`RoutePreviewStop`**, `Notification`, `OperationalSettings`, `DailyOrderOverview`, `ClientMessage`.

### 8.3 Input types

| Input                            | Notes                                                        |
| -------------------------------- | ------------------------------------------------------------ |
| `CreateOwnUserInput`             | `locale?` only — **no role**                                 |
| `UpdateApothekerProfileInput`    | pharmacy fields — ownership checked                          |
| `PlaceOrderInput`                | `lines: [{ vaccineId, quantityDoses }]` — **no apothekerId** |
| `UpdateOrderStatusInput`         | `orderId`, `targetStatus` — admin                            |
| `AdjustStockInput`               | `vaccineId`, `deltaQuantity`, `reason` — admin               |
| `CreateRouteTemplateInput`       | name, bezorgerProfileId, stops                               |
| `UpdateRouteTemplateInput`       | partial template                                             |
| `GenerateRouteInput`             | `routeTemplateId`, `deliveryDate`                            |
| `UpdateRouteStatusInput`         | `routeId`, `targetStatus`                                    |
| `UpdateOperationalSettingsInput` | policy fields — admin                                        |

### 8.4 Operations matrix

#### Queries

| Operation                       | Actor     | Role      | Ownership                         | Validation    | Service                 | Result                                     | Realtime | Tests              |
| ------------------------------- | --------- | --------- | --------------------------------- | ------------- | ----------------------- | ------------------------------------------ | -------- | ------------------ |
| `getOwnUser`                    | auth user | any       | self                              | —             | UsersService            | User                                       | —        | unit + E2E         |
| `vaccines`                      | auth      | any       | —                                 | —             | VaccinesService         | [Vaccine]                                  | —        | E2E                |
| `vaccine(id)`                   | auth      | any       | —                                 | exists        | VaccinesService         | Vaccine                                    | —        | unit               |
| `myOrders(filter?)`             | apotheker | APOTHEKER | `@CurrentUser→apothekerProfileId` | pagination    | OrdersService           | [Order]                                    | —        | authz E2E          |
| `myWeeklyUsage(week?)`          | apotheker | APOTHEKER | own profile                       | week bounds   | WeeklyUsageService      | WeeklyUsageSummary                         | —        | unit limit         |
| `myNotifications(unreadOnly?)`  | auth      | any       | recipient=self                    | —             | NotificationsService    | [Notification]                             | —        | E2E                |
| `adminDailyOrderOverview(date)` | admin     | ADMIN     | —                                 | date          | OrdersService           | [DailyOrderOverview]                       | —        | E2E                |
| `adminWeeklyStatistics(week?)`  | admin     | ADMIN     | —                                 | week          | WeeklyUsageService      | aggregates                                 | —        | unit               |
| `adminOrders(filter?)`          | admin     | ADMIN     | —                                 | —             | OrdersService           | [Order]                                    | —        | authz              |
| `stockOverview`                 | admin     | ADMIN     | —                                 | —             | StockService            | [Vaccine]                                  | —        | E2E                |
| `stockAdjustments(vaccineId?)`  | admin     | ADMIN     | —                                 | —             | StockService            | [StockAdjustment]                          | —        | unit               |
| `routeTemplates`                | admin     | ADMIN     | —                                 | —             | RouteTemplatesService   | [RouteTemplate]                            | —        | E2E                |
| `routeTemplate(id)`             | admin     | ADMIN     | —                                 | —             | RouteTemplatesService   | RouteTemplate                              | —        | unit               |
| `deliveryRoutes(filter?)`       | admin     | ADMIN     | —                                 | —             | RoutesService           | [DeliveryRoute]                            | —        | E2E                |
| `myTodayRoute`                  | bezorger  | BEZORGER  | `@CurrentUser→bezorgerProfileId`  | date=today    | RoutesService           | **DeliveryRoute?** (persisted)             | —        | authz E2E          |
| `myTomorrowRoutePreview`        | bezorger  | BEZORGER  | own                               | preview rules | **RoutePreviewService** | **RoutePreview** (computed, not persisted) | —        | unit + E2E preview |
| `operationalSettings`           | admin     | ADMIN     | —                                 | —             | SettingsService         | OperationalSettings                        | —        | unit               |

#### Mutations

| Operation                   | Actor          | Role                 | Ownership          | Validation                                  | Service                     | Result                 | Realtime                                       | Tests             |
| --------------------------- | -------------- | -------------------- | ------------------ | ------------------------------------------- | --------------------------- | ---------------------- | ---------------------------------------------- | ----------------- |
| `createOwnUser`             | auth Firebase  | any (first register) | self               | email match token                           | UsersService                | User                   | —                                              | E2E register      |
| `updateOwnApothekerProfile` | apotheker      | APOTHEKER            | own profile        | class-validator                             | UsersService                | ApothekerProfile       | —                                              | authz             |
| `placeOrder`                | apotheker      | APOTHEKER            | inject profileId   | limits, closing, qty                        | OrderService                | Order                  | `APOTHEKER_ORDER_CONFIRMED`, `ADMIN_NEW_ORDER` | unit limits + E2E |
| `cancelOrder(orderId)`      | admin          | ADMIN                | —                  | status pending                              | OrderService                | Order                  | optional                                       | E2E               |
| `updateOrderStatus`         | admin          | ADMIN                | —                  | state machine; **stock check on DELIVERED** | OrderService + StockService | Order                  | `ORDER_STATUS_CHANGED`                         | unit FSM + E2E    |
| `adjustStock`               | admin          | ADMIN                | —                  | delta ≠ 0                                   | StockService                | Vaccine                | `ADMIN_LOW_STOCK` if threshold                 | unit + E2E        |
| `createRouteTemplate`       | admin          | ADMIN                | —                  | stops valid                                 | RouteTemplatesService       | RouteTemplate          | —                                              | E2E               |
| `updateRouteTemplate`       | admin          | ADMIN                | —                  | —                                           | RouteTemplatesService       | RouteTemplate          | —                                              | unit              |
| `assignTemplateToBezorger`  | admin          | ADMIN                | —                  | profile role                                | RouteTemplatesService       | RouteTemplate          | —                                              | E2E               |
| `generateDeliveryRoute`     | admin          | ADMIN                | —                  | date, template                              | RouteGenerationService      | DeliveryRoute (upsert) | `BEZORGER_ROUTE_ASSIGNED`                      | unit filter + E2E |
| `updateRouteStatus`         | admin/bezorger | ADMIN / BEZORGER     | bezorger own route | FSM                                         | RoutesService               | DeliveryRoute          | `BEZORGER_ROUTE_UPDATED`                       | authz             |
| `markNotificationRead(id)`  | auth           | any                  | recipient=self     | —                                           | NotificationsService        | Notification           | —                                              | unit              |
| `updateOperationalSettings` | admin          | ADMIN                | —                  | sane caps                                   | SettingsService             | OperationalSettings    | —                                              | unit              |

**Public operations (no auth):** none for domain data. Auth is Firebase client-side; GraphQL assumes Bearer token for all domain operations except optional health check REST `/health` if added.

#### Subscriptions

| Operation               | Actor     | Role      | Ownership filter                            | Event                                  | Tests  |
| ----------------------- | --------- | --------- | ------------------------------------------- | -------------------------------------- | ------ |
| `apothekerOrderUpdates` | apotheker | APOTHEKER | `payload.apothekerProfileId === subscriber` | order confirm, delivered, week warning | WS E2E |
| `adminOperationsFeed`   | admin     | ADMIN     | role=ADMIN                                  | new order, low stock                   | WS E2E |
| `bezorgerRouteUpdates`  | bezorger  | BEZORGER  | `payload.bezorgerProfileId === subscriber`  | route assigned/updated                 | WS E2E |

#### Field resolvers

| Parent          | Field                                 | Resolver behavior                             |
| --------------- | ------------------------------------- | --------------------------------------------- |
| `User`          | `apothekerProfile`, `bezorgerProfile` | Load by FK if present                         |
| `Order`         | `apothekerProfile`                    | Admin only or own order                       |
| `DeliveryRoute` | `bezorgerProfile`, `template`         | Admin or owning bezorger                      |
| `DeliveryStop`  | `lines`                               | Already embedded — passthrough                |
| `RouteTemplate` | `bezorgerProfile`                     | Admin                                         |
| `Vaccine`       | `isLowStock`                          | computed `stockQuantity <= lowStockThreshold` |

---

## 9. Authorization matrix

Backend enforcement is **authoritative**. Frontend route guards and hidden nav items are supplementary only.

| Operation                                                     | Anonymous      | Apotheker    | Bezorger          | Admin        | Ownership                               | Deny cases                              |
| ------------------------------------------------------------- | -------------- | ------------ | ----------------- | ------------ | --------------------------------------- | --------------------------------------- |
| Firebase login/register                                       | allow (client) | —            | —                 | —            | —                                       | —                                       |
| `createOwnUser`                                               | deny           | allow (self) | allow (self)      | allow (self) | self                                    | role in input rejected                  |
| `getOwnUser`                                                  | deny           | allow        | allow             | allow        | self                                    | —                                       |
| `placeOrder`                                                  | deny           | allow        | deny              | deny         | own profile injected                    | wrong role; limits fail                 |
| `myOrders`, `myWeeklyUsage`                                   | deny           | allow        | deny              | deny         | own                                     | 403 if apothekerId mismatch             |
| `myTodayRoute`, `myTomorrowRoutePreview`                      | deny           | deny         | allow             | deny         | own bezorgerProfileId                   | 403 other bezorger                      |
| `updateRouteStatus`                                           | deny           | deny         | allow (own route) | allow        | bezorger: route.bezorgerProfileId match | bezorger on other's route               |
| All `admin*` queries/mutations                                | deny           | deny         | deny              | allow        | —                                       | 403 non-admin                           |
| `updateOrderStatus`, `adjustStock`, templates, generate route | deny           | deny         | deny              | allow        | —                                       | bezorger/apotheker 403                  |
| `apothekerOrderUpdates` subscription                          | deny           | allow        | deny              | deny         | filter payload                          | wrong profile id in event               |
| `adminOperationsFeed`                                         | deny           | deny         | deny              | allow        | role filter                             | non-admin subscribed → no events        |
| `bezorgerRouteUpdates`                                        | deny           | deny         | allow             | deny         | filter payload                          | cross-bezorger 403 on query + empty sub |
| View other apotheker orders                                   | deny           | deny         | deny              | allow (ops)  | admin role                              | apotheker 403                           |
| View other bezorger routes                                    | deny           | deny         | deny              | deny         | —                                       | all 403                                 |

**Explicit denials tested in E2E:** apotheker A cannot query apotheker B orders; bezorger A cannot query bezorger B route; apotheker cannot `adjustStock`; bezorger cannot `generateDeliveryRoute`.

---

## 10. Authentication flows

### 10.1 Registration

1. Client: Firebase `createUserWithEmailAndPassword`.
2. Client: obtain ID token.
3. Client: `createOwnUser` mutation with Bearer token (optional `locale`).
4. Server: verify token → derive `external_uid`, email.
5. Server: create `User` with default role **`APOTHEKER`** for self-registration (safest default); admin/bezorger roles assigned **only in seed** or admin provisioning (future).
6. Server: create linked `ApothekerProfile` stub if role is apotheker.

**Role assignment policy:** normal self-registration **cannot** select `ADMIN` or `BEZORGER`. Evaluator accounts are seed-created.

### 10.2 Login

1. Firebase email/password sign-in.
2. Apollo auth link attaches `Authorization: Bearer <idToken>`.
3. `restoreOwnUser()` query hydrates role and profile IDs.
4. Router redirects by role: apotheker → `/apotheker`, admin → `/admin`, bezorger → `/bezorger`.

### 10.3 API verification

- `AuthorizationGuard` + `FirebaseAuthStrategy` validate Bearer token via Firebase Admin.
- `@CurrentUser()` returns application `User` loaded by `external_uid`.
- WebSocket: `graphql-ws` `onConnect` reads `connectionParams.authToken`, same verification, attach `user` to context (reference pattern Issue #49).

### 10.4 Seeded evaluator users

| Email                | Password      | Role      | Purpose                       |
| -------------------- | ------------- | --------- | ----------------------------- |
| `docent@howest.be`   | `P@ssword123` | ADMIN     | **Mandatory** evaluator login |
| `apotheker1@demo.be` | `Demo123!`    | APOTHEKER | Seed scenario                 |
| `apotheker2@demo.be` | `Demo123!`    | APOTHEKER | Isolation tests               |
| `bezorger1@demo.be`  | `Demo123!`    | BEZORGER  | Today route                   |
| `bezorger2@demo.be`  | `Demo123!`    | BEZORGER  | Cross-authz                   |

Document in README as **demo credentials only**.

### 10.5 Logout and expired token

- Logout: Firebase signOut, clear Apollo cache, unsubscribe WebSocket, redirect `/auth/login`.
- Expired token: Apollo error link detects 401/UNAUTHENTICATED → force refresh once via Firebase `getIdToken(true)`; on failure redirect login with message.

---

## 11. Frontend information architecture

### 11.1 Route groups

| Group         | Layout                   | Guard meta                        | Base path    |
| ------------- | ------------------------ | --------------------------------- | ------------ |
| **auth**      | `FeatureAuthLayout`      | `preventLoggedIn`                 | `/auth`      |
| **apotheker** | `FeatureApothekerLayout` | `requiresAuth`, `role: APOTHEKER` | `/apotheker` |
| **admin**     | `FeatureAdminLayout`     | `requiresAuth`, `role: ADMIN`     | `/admin`     |
| **bezorger**  | `FeatureBezorgerLayout`  | `requiresAuth`, `role: BEZORGER`  | `/bezorger`  |

### 11.2 Views

**`/auth`**

| Route                   | View                     | Purpose                  |
| ----------------------- | ------------------------ | ------------------------ |
| `/auth/login`           | `ViewAuthLogin`          | Login                    |
| `/auth/register`        | `ViewAuthRegister`       | Register + createOwnUser |
| `/auth/forgot-password` | `ViewAuthForgotPassword` | Password reset           |

**`/apotheker`**

| Route                     | View                         | Purpose                       |
| ------------------------- | ---------------------------- | ----------------------------- |
| `/apotheker`              | `ViewApothekerDashboard`     | Week usage summary + warnings |
| `/apotheker/bestellen`    | `ViewApothekerPlaceOrder`    | Place order form              |
| `/apotheker/bestellingen` | `ViewApothekerOrderHistory`  | History + statuses            |
| `/apotheker/meldingen`    | `ViewApothekerNotifications` | Notification feed             |

**`/admin`**

| Route                     | View                      | Purpose                        |
| ------------------------- | ------------------------- | ------------------------------ |
| `/admin`                  | `ViewAdminDashboard`      | Daily overview + realtime feed |
| `/admin/bestellingen`     | `ViewAdminOrders`         | Orders + status updates        |
| `/admin/stock`            | `ViewAdminStock`          | Stock levels + adjust          |
| `/admin/routes/templates` | `ViewAdminRouteTemplates` | Template CRUD                  |
| `/admin/routes/planning`  | `ViewAdminRoutePlanning`  | Generate/assign routes         |
| `/admin/statistieken`     | `ViewAdminWeeklyStats`    | Weekly vaccine stats           |

**`/bezorger`**

| Route                 | View                          | Purpose                                             |
| --------------------- | ----------------------------- | --------------------------------------------------- |
| `/bezorger`           | `ViewBezorgerTodayRoute`      | Today's stops (mobile-first)                        |
| `/bezorger/morgen`    | `ViewBezorgerTomorrowPreview` | Tomorrow **`RoutePreview`** (computed, live orders) |
| `/bezorger/meldingen` | `ViewBezorgerNotifications`   | Route alerts                                        |

**Generic:** `ViewGeneric404`, `ViewGenericForbidden`.

### 11.3 Navigation and redirects

- `useRoleRedirect`: after login, send user to default home for role.
- Wrong role accessing path → `/forbidden` (not silent wrong data).
- Shared `CommonHeader` with logout, notification badge, connection indicator.

### 11.4 UX requirements

| Concern           | Implementation                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Loading           | Nuxt UI skeletons on all async views                                                                                            |
| Empty             | `CommonEmptyState` — no orders, empty route, no notifications                                                                   |
| Validation        | Zod schemas + inline field errors on forms                                                                                      |
| Permission errors | `CommonPermissionDenied` + GraphQL error toast                                                                                  |
| Realtime state    | `useRealtimeConnection` — connected / reconnecting / offline banner                                                             |
| Responsive        | Bezorger views mobile-first; admin tables scroll on small screens                                                               |
| a11y              | Keyboard nav, focus management on route change, `aria-live` for toasts, sufficient contrast, `prefers-reduced-motion` respected |

---

## 12. Realtime design

Focused set — **no global unfiltered stream**.

### 12.1 Apotheker order confirmation and delivery updates

| Aspect           | Detail                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Event name       | `APOTHEKER_ORDER_UPDATED`                                              |
| Publisher        | `OrderService` after `placeOrder`, `updateOrderStatus`                 |
| Payload          | `{ apothekerProfileId, orderId, status, deliveryDate, message, type }` |
| Recipient filter | `payload.apothekerProfileId === context.user.apothekerProfileId`       |
| Role             | APOTHEKER                                                              |
| Apollo reaction  | Subscription in layout → toast + update order list cache               |
| Reconnection     | On WS reconnect, `refetchQueries: ['myOrders', 'myWeeklyUsage']`       |
| Tests            | Supertest WS + E2E apotheker sees toast                                |

### 12.2 Admin new-order and low-stock feed

| Aspect           | Detail                                                             |
| ---------------- | ------------------------------------------------------------------ |
| Event names      | `ADMIN_NEW_ORDER`, `ADMIN_LOW_STOCK`                               |
| Publisher        | `OrderService`, `StockService`                                     |
| Payload          | Order summary / `{ vaccineId, name, stockQuantity, threshold }`    |
| Recipient filter | `context.user.role === ADMIN`                                      |
| Role             | ADMIN                                                              |
| Apollo reaction  | Dashboard feed list prepends item; stock badge turns warning color |
| Reconnection     | Refetch `adminDailyOrderOverview`, `stockOverview`                 |
| Tests            | Subscription filter rejects apotheker subscriber                   |

### 12.3 Bezorger route assignment / update

| Aspect           | Detail                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Event name       | `BEZORGER_ROUTE_UPDATED`                                                                       |
| Publisher        | `RouteGenerationService`, `RoutesService`                                                      |
| Payload          | `{ bezorgerProfileId, routeId, deliveryDate, status, stopCount }`                              |
| Recipient filter | `payload.bezorgerProfileId === context.user.bezorgerProfileId`                                 |
| Role             | BEZORGER                                                                                       |
| Apollo reaction  | Toast + refetch `myTodayRoute` / preview                                                       |
| Reconnection     | Refetch `myTodayRoute`; refetch `myTomorrowRoutePreview` (computed — always fresh from server) |
| Tests            | WS auth + ownership filter                                                                     |

### 12.4 Week-limit warning (apotheker)

Published as `APOTHEKER_ORDER_UPDATED` with `type: WEEK_LIMIT_WARNING` when post-submit weekly usage ≥ warning threshold.

---

## 13. PWA design

### 13.1 Initial MVP (mandatory acceptance criteria)

| Aspect                        | Design                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manifest**                  | `name: Vaccinatie-levering`, `short_name: Vaccin`, `theme_color`, `background_color`, `display: standalone`, `start_url: /`, icons 192+512  |
| **Icons**                     | SVG + PNG in `public/icons/`                                                                                                                |
| **Display**                   | `standalone` (fullscreen launch per checklist)                                                                                              |
| **Service worker**            | `vite-plugin-pwa` with Workbox — **enabled** (unlike reference defect)                                                                      |
| **Application shell**         | Precache JS/CSS/index (app-shell caching)                                                                                                   |
| **Update notification**       | Prompt when new SW available (`registerType: 'prompt'`)                                                                                     |
| **Offline fallback**          | `/offline.html` for navigation failures when network unavailable                                                                            |
| **Online-required mutations** | `placeOrder`, `updateOrderStatus`, `adjustStock`, `generateDeliveryRoute`, auth — **no offline queue** (unsafe without conflict resolution) |

**Presentation narrative:** installable fullscreen client for bezorger field use and fast shell load for all roles; offline limited to static shell + fallback page.

### 13.2 Deferred optional enhancement (not initial MVP)

| Aspect                                      | Why deferred                                                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cached authenticated courier route data** | Requires careful privacy design (account switching), cache expiry, invalidation on regeneration, and logout cleanup — not required for checklist compliance |

Do **not** include authenticated route caching in initial MVP acceptance criteria. If implemented later, document: user-scoped cache keys, clear on logout, TTL, and no admin/stock data in Cache API.

**Privacy (MVP):** service worker precaches **static assets only** — no GraphQL response caching for authenticated endpoints.

---

## 14. Seed design

**Command:** `npm run seed:database:all` (idempotent — upsert by natural keys: email, vaccine `code`, template name + date).

### 14.1 Accounts

| Key          | Email                | Role      | Scenario                            |
| ------------ | -------------------- | --------- | ----------------------------------- |
| `docent`     | `docent@howest.be`   | ADMIN     | Evaluator                           |
| `apotheker1` | `apotheker1@demo.be` | APOTHEKER | Happy path, near daily limit type A |
| `apotheker2` | `apotheker2@demo.be` | APOTHEKER | Weekly limit boundary, isolation    |
| `apotheker3` | `apotheker3@demo.be` | APOTHEKER | Empty history edge                  |
| `bezorger1`  | `bezorger1@demo.be`  | BEZORGER  | Today route                         |
| `bezorger2`  | `bezorger2@demo.be`  | BEZORGER  | Cross-authz denial                  |

### 14.2 Domain seed scenarios

| Scenario                       | Seed data                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Three vaccines                 | `FLU`, `COVID`, `MMR` with thresholds                                                                                      |
| Normal orders                  | Mixed statuses for apotheker1                                                                                              |
| Daily limit boundary           | apotheker1 at 48 doses FLU same day                                                                                        |
| Weekly limit boundary          | apotheker2 at 195 total doses current ISO week                                                                             |
| Closing time                   | One order timestamp 13:59, one 14:01 — different delivery dates                                                            |
| Low stock                      | COVID at 5 units, threshold 10                                                                                             |
| Healthy stock                  | FLU ample                                                                                                                  |
| Template with skipped pharmacy | Template includes apotheker3 (no order) — skipped in route                                                                 |
| Today's route                  | bezorger1 assigned with 2–3 stops                                                                                          |
| Tomorrow preview               | Qualifying orders before closing for next day — **exercised via `myTomorrowRoutePreview` query**, not persisted seed route |
| Cross-user authz               | bezorger1 route ≠ bezorger2                                                                                                |
| Realtime demo                  | Pending order for admin feed; apotheker2 near week warning                                                                 |
| Settings                       | closing 14:00, timezone Europe/Brussels, 90% warning                                                                       |

Firebase users created via Admin SDK in same seed pass (reference Issue #42).

---

## 15. Testing architecture

| Layer        | Scope                                                                                                                      | Tooling                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Unit         | `DeliveryDatePolicy` — before/after closing, timezone edge                                                                 | Jest                             |
| Unit         | `OrderLimitService` — daily 50, weekly 200, boundary 49→50 and 199→200                                                     | Jest                             |
| Unit         | Order status FSM — invalid transitions rejected; no `OUT_FOR_DELIVERY` in MVP                                              | Jest                             |
| Unit         | `StockService` — sole balance writer; audit append; idempotency key; **insufficient stock fails**; duplicate deliver no-op | Jest                             |
| Unit         | `RouteGenerationService` — skip pharmacies without orders; upsert same `(bezorger, date)`                                  | Jest                             |
| Unit         | `RoutePreviewService` — tomorrow preview from qualifying orders; not persisted; excludes post-closing orders               | Jest                             |
| Unit         | `RolesGuard`, ownership guard                                                                                              | Jest                             |
| Integration  | GraphQL `placeOrder` → limits → persist (single-request boundary cases)                                                    | Supertest                        |
| E2E API      | Authz matrix negative cases                                                                                                | Supertest + Firebase mock        |
| E2E API      | Subscriptions filtering                                                                                                    | Supertest WS                     |
| E2E API      | `markDelivered` insufficient stock returns error; duplicate deliver does not double decrement                              | Supertest                        |
| Playwright   | Apotheker place order → see confirmation (meaningful flow)                                                                 | Playwright                       |
| Playwright   | PWA manifest + SW registered                                                                                               | Playwright + Lighthouse optional |
| Docker smoke | `docker compose up` → health endpoints green                                                                               | CI job (phase 5)                 |

**Documented test note:** concurrent limit race (two simultaneous submits) is **not** automated in MVP — covered by architecture documentation and deferred hardening list.

### 15.1 CI progression (end target — not all at repository init)

All stages below are the **end target** for the presentation-ready project. Introduce incrementally during the roadmap; **do not require all jobs on day one**.

| Phase | Job               | Steps                                                       | When to add                   |
| ----- | ----------------- | ----------------------------------------------------------- | ----------------------------- |
| **1** | `ci-api`          | install → lint → typecheck → **Jest unit tests**            | First API scaffold            |
| **2** | `ci-pwa`          | install → lint → vue-tsc → **production build**             | First PWA scaffold            |
| **3** | `ci-api-e2e`      | Supertest GraphQL E2E (MongoMemoryServer or test container) | After auth + first mutations  |
| **4** | `ci-playwright`   | Firebase mock/emulator → Playwright integration             | After login + one flow        |
| **5** | `ci-docker-smoke` | build images → compose up → API `/health` + PWA `/`         | Before presentation hardening |

Workflow files may start as a single workflow with jobs enabled progressively, or as separate files added per phase — implementation choice.

---

## 16. Docker and environment design

### 16.1 Development Compose

`infrastructure/docker-compose-dev.yml`:

- **mongo:** port 27017 (or 27027), volume, healthcheck
- API and PWA run on host via `npm run dev` (reference pattern)

### 16.2 Production / presentation Compose

`infrastructure/docker-compose-production.yml`:

| Service | Image                             | Depends on    | Health        |
| ------- | --------------------------------- | ------------- | ------------- |
| mongo   | mongo:7                           | —             | mongosh ping  |
| api     | `@vaccin-delivery/api` Dockerfile | mongo healthy | GET `/health` |
| pwa     | nginx + static build              | api           | GET `/`       |

**Startup order:** mongo → api → pwa. Seed run **manually** after first up: `docker compose exec api npm run seed:database:all` (document in README).

### 16.3 Dockerfiles

- **API:** multi-stage node:24-alpine, build, production `node dist/main`, non-root user.
- **PWA:** node build → nginx:alpine serves `dist`, `nginx.conf` SPA fallback.

### 16.4 Environment files

**`packages/api/.env.example`**

```
PORT=3000
URL_FRONTEND=http://localhost:5173
DB_HOST=mongodb://mongo:27017/vaccin-delivery
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase-sa.json
NODE_ENV=development
```

**`packages/pwa/.env.example`**

Public Firebase **browser configuration** — not secret; embedded in client bundle at build time. Use env vars for deployment flexibility only.

```
VITE_BACKEND_URL=http://localhost:3000/graphql
VITE_BACKEND_WS_URL=ws://localhost:3000/graphql
VITE_FIREBASE_API_KEY=your-firebase-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your-app-id
```

### 16.5 Credentials classification

#### Sensitive — never commit

| Secret                                                 | Handling                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Firebase Admin **service-account JSON** (private keys) | `GOOGLE_APPLICATION_CREDENTIALS` path; Docker secret mount; `.gitignore` |
| GitHub tokens / CI secrets                             | GitHub Actions secrets only                                              |
| Production MongoDB credentials                         | Env / Compose secrets                                                    |

Provide `firebase-service-account.json.example` with dummy structure only.

#### Public browser configuration — not private secrets

These values are **expected to ship in the PWA bundle**. Store in `VITE_*` env vars for environment-specific builds, but do **not** treat them as confidential:

- Firebase client API key
- Auth domain
- Project ID
- App ID

Firebase security relies on Auth rules, API authorization, and Firebase console restrictions — not on hiding the web API key.

### 16.6 API security foundation (Phase 22)

| Control    | Behaviour                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limit | Global `GraphqlThrottlerGuard` (usually IP); strict identity guard after auth on expensive mutations                                                                |
| Cache      | Process-local `settings:current`, `vaccines:active`, `vaccines:all` with write invalidation                                                                         |
| Headers    | Helmet before routes; env-aware CSP for GraphiQL in non-production                                                                                                  |
| GraphQL    | Custom max-depth rule + complexity Apollo plugin (default max 500)                                                                                                  |
| Body size  | `API_JSON_BODY_LIMIT` sets Express `json`/`urlencoded` `limit` (Nest `bodyParser: false`; one parser pair). Applies without Content-Length. Media uploads Phase 25. |
| Errors     | `extensions.code = RATE_LIMITED` (no tracker/IP/UID leakage)                                                                                                        |

Apollo HTTP batching is **disabled**. Shared bootstrap: `common/bootstrap/configure-api-app.ts`.

---

## 17. Requirement traceability

| Requirement ID               | Architecture section | Module                               | Verification           |
| ---------------------------- | -------------------- | ------------------------------------ | ---------------------- |
| API-001 NestJS               | §2, §4               | `packages/api`                       | Source inspection      |
| API-002 GraphQL              | §8                   | all resolvers                        | Playground             |
| API-015 Subscriptions        | §12                  | orders, stock, routes, notifications | WS E2E                 |
| AUTH-001 Firebase            | §10                  | authentication, PWA                  | Login E2E              |
| AUTH-007 docent admin        | §14                  | seed                                 | Login test             |
| AUTHZ-001 ≥2 roles           | §9                   | users, guards                        | Authz E2E (3 roles)    |
| AUTHZ-005 ownership          | §9, §8               | all services                         | Authz E2E              |
| DATA-003 MongoDB             | §5                   | TypeORM entities                     | Compose                |
| DATA-007 seed                | §14                  | seed                                 | Seed command           |
| DEVOPS-002 Docker full stack | §16                  | infrastructure                       | Presentation rehearsal |
| FRONT-001 Vue 3              | §11                  | pwa                                  | UI demo                |
| FRONT-022 PWA                | §13                  | pwa vite-plugin-pwa                  | Lighthouse             |
| FRONT-024 integration test   | §15                  | tests/                               | Playwright CI          |
| TEST-001 Jest                | §15                  | api `*.spec.ts`                      | npm test               |
| TEST-006 GitHub Actions      | §15.1                | `.github/workflows`                  | CI phased rollout      |
| DOMAIN-001 fiche flows       | §4–§8                | domain modules                       | Functional checklist   |
| RULE-001–007 limits/closing  | §5–§7                | orders                               | Unit + E2E             |
| RULE-011 route skip          | §7                   | routes                               | Unit filter test       |
| RULE-014 bezorger isolation  | §9                   | routes                               | Authz E2E              |
| RT-001–006 realtime          | §12                  | PubSub                               | Subscription tests     |
| DOC-001 README               | §16                  | root README                          | Clone test             |

---

## 18. Architectural risks

| Risk                            | Impact                                                    | Mitigation                                                                                                                       |
| ------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Race conditions in order limits | Two concurrent submits may both pass pre-insert check     | MVP: read-then-insert in `placeOrder()`; thorough boundary tests; **document remaining race**; defer transactions/counters/locks |
| Stock consistency               | Double decrement / negative stock / deliver without stock | `StockService` sole writer; idempotency key; fail if insufficient; duplicate deliver no-op; unit + E2E tests                     |
| Date/time handling              | Wrong delivery day                                        | Central `DeliveryDatePolicy`; unit tests with Europe/Brussels DST edges                                                          |
| Realtime privacy                | Cross-user events                                         | Strict subscription filters + auth on connect; E2E negative tests                                                                |
| PWA scope creep                 | Privacy bugs from cached auth data                        | **Defer authenticated route caching**; MVP precaches static shell only                                                           |
| Firebase/DB user sync           | Orphan Firebase or Mongo users                            | `createOwnUser` idempotent; seed upsert by email                                                                                 |
| Docker secret handling          | Leaked service-account JSON                               | Env mount only; `.gitignore`; example placeholders                                                                               |
| Over-scoping                    | Miss deadline                                             | End-state architecture implemented **incrementally** via vertical slices; optional items excluded from early phases              |

---

## 19. Architecture decisions (ADR)

| ID      | Decision            | Chosen approach                                                | Alternatives                                  | Reason                                                    | Trade-off                                |
| ------- | ------------------- | -------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| ADR-001 | Monorepo layout     | npm workspaces, 3 packages                                     | Separate repos                                | Course alignment, shared types                            | Initial scaffold effort                  |
| ADR-002 | Database            | MongoDB + TypeORM                                              | Mongoose, PostgreSQL                          | Checklist L64; reference pattern                          | No relational joins                      |
| ADR-003 | Order lines         | Embedded in Order                                              | Separate collection                           | Always accessed with parent                               | Harder line-level queries                |
| ADR-004 | Delivery stops      | Embedded snapshot                                              | Live join on read                             | Historical accuracy for courier                           | Storage duplication                      |
| ADR-005 | Profiles            | Separate entities                                              | Embedded in User                              | Cleaner role-specific fields                              | Extra joins                              |
| ADR-006 | Auth                | Firebase email/password                                        | Auth0, custom JWT                             | Checklist                                                 | Vendor lock-in                           |
| ADR-007 | PKCE                | Not used by default                                            | PKCE on all flows                             | Not applicable to email/password                          | Revisit if OAuth added                   |
| ADR-008 | Realtime transport  | GraphQL subscriptions graphql-ws                               | SSE, Socket.io                                | Course Issues #47–50                                      | WS complexity                            |
| ADR-009 | Stock timing        | Decrement on DELIVERED; balance on `Vaccine.stockQuantity`     | Decrement on submit; sum adjustments          | Policy default; audit log separate                        | Stock not reserved at order time         |
| ADR-010 | PWA                 | Single app, role routes; shell precache only in MVP            | Separate bezorger build; offline route cache  | One deployable artifact; checklist met without auth cache | Authenticated cache deferred             |
| ADR-011 | Seed strategy       | Idempotent CLI                                                 | Auto seed every boot                          | Safe for evaluators                                       | Manual presentation step                 |
| ADR-012 | synchronize         | true in dev                                                    | Migrations                                    | Reference demo speed                                      | Production schema drift if misconfigured |
| ADR-013 | Order FSM           | `PENDING`, `PLANNED`, `DELIVERED`, `CANCELLED`                 | Include `OUT_FOR_DELIVERY`                    | Simpler MVP; fiche maps to in behandeling/geleverd        | Add later if route execution needs it    |
| ADR-014 | Route FSM           | `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`            | Include `DRAFT`                               | Generation upserts directly to ASSIGNED                   | No draft editing workflow in MVP         |
| ADR-015 | Tomorrow view       | `RoutePreview` computed, not persisted                         | Persist preview as `DeliveryRoute`            | Preview reflects live orders until admin generates        | Extra query logic                        |
| ADR-016 | Route uniqueness    | Unique `(bezorgerProfileId, deliveryDate)`; regenerate updates | Partial unique index; multiple routes per day | One courier/day clarity                                   | Cancelled slot blocks until regenerate   |
| ADR-017 | Order limits        | Read totals immediately before insert                          | Lock docs / transactions in MVP               | Simple, testable; documented race                         | Concurrent edge case accepted            |
| ADR-018 | Generated artifacts | Gitignore `schema.gql` + `graphql.d.ts`; CI regenerates        | Commit generated types                        | Avoid drift and merge noise                               | Requires codegen in CI build step        |

---

## 20. Readiness conclusion

### Verdict: **Ready for implementation roadmap**

The architecture covers all mandatory _Vaccinatie-levering_ flows, exam checklists, realtime requirements, Docker presentation path, authorization model, and seed scenarios. Domain open questions are resolved through **configurable policies** (§1) and do not block implementation planning.

### End-state vs incremental delivery

This document describes the **intentional end-state design**, not the first commit. The implementation roadmap must:

- Introduce capabilities **incrementally** in dependency order (see CI phases §15.1).
- Keep **optional enhancements out of early phases** (authenticated PWA route cache, i18n, Vitest, Lerna, limit hardening with transactions/counters).
- Implement each domain workflow as a **bounded vertical slice** (e.g. auth → place order → admin stock → generate route → bezorger today + tomorrow preview → realtime → Docker).

Simplified MVP choices (order/route state machines, read-then-insert limits, no auth data caching) are deliberate scoping decisions, not omissions.

### Genuine blockers

**None.** There is no missing starter project, no unresolved domain ambiguity that prevents scaffolding, and no external service dependency beyond standard Firebase + MongoDB setup documented in README.

### Recommended next steps (post-approval)

1. Approve this architecture document.
2. Produce phased implementation roadmap aligned with vertical slices and CI phases §15.1.
3. Initialize `examAfsdMaciejMitura/` Git repository per §3 structure.
4. Author exam `AGENTS.md` and `.env.example` files before feature coding.

---

_Document version: 2026-07-14 (rev 2). Target repository: `examAfsdMaciejMitura/`. Reference: `bearspray-2025-demo` @ `ad691e3` (patterns only)._
