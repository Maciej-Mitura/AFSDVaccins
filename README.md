# Vaccinatie-levering

Digital platform for vaccine ordering and delivery route management. Apothekers
place vaccine orders within daily and weekly limits; administrators manage stock,
orders, and route templates; bezorgers execute delivery routes on mobile-first
screens.

## Current status

**Phase 18 complete — Playwright frontend end-to-end tests.** Chromium browser
tests exercise critical ADMIN, APOTHEKER, and BEZORGER journeys against an
isolated MongoMemoryServer API and a production-like Vite preview. Auth uses a
dual-gated test-only bypass (no personal Firebase accounts).

**Next phase:** Phase 19 — production Docker stack.

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

## Database seed (Phase 15)

### Purpose

Populate Firebase Authentication and MongoDB with a **deterministic, idempotent**
demo dataset for presentation, role testing, and authz demos. The seed does
**not** start on API boot — run it explicitly.

### Prerequisites

1. MongoDB running (`infrastructure/docker-compose-dev.yml` or local).
2. Firebase Admin credentials via `GOOGLE_APPLICATION_CREDENTIALS` (same as API).
3. `packages/api/.env` configured (see `.env.example`).

### Firebase vs MongoDB responsibility

| Layer                     | Responsibility                                                                |
| ------------------------- | ----------------------------------------------------------------------------- |
| Firebase Auth             | Identity accounts (email/password) for demo users                             |
| MongoDB `User`            | Application role (`ADMIN` / `APOTHEKER` / `BEZORGER`) linked by `firebaseUid` |
| MongoDB profiles / domain | Pharmacies, couriers, vaccines, stock, orders, templates, routes              |

Public self-registration remains limited to **APOTHEKER** and **BEZORGER**.
**ADMIN** is never available through public registration — only via seed (or
future admin provisioning).

### Required environment variables

In `packages/api/.env`:

```env
NODE_ENV=development
ALLOW_DATABASE_SEED=true
SEED_DEMO_PASSWORD=change-me-demo-only
```

Optional UID overrides (link to existing Firebase accounts; omit for normal
email-based resolve/create):

```env
# SEED_DOCENT_FIREBASE_UID=
# SEED_APOTHEKER1_FIREBASE_UID=
# SEED_APOTHEKER2_FIREBASE_UID=
# SEED_APOTHEKER3_FIREBASE_UID=
# SEED_BEZORGER1_FIREBASE_UID=
# SEED_BEZORGER2_FIREBASE_UID=
```

How to obtain a Firebase UID for an existing account: Firebase console →
**Authentication → Users** → open the user → copy **User UID**. Prefer email
resolve when possible; use overrides only when you intentionally reuse an
existing Auth user.

### Production safety

The seed aborts with a non-zero exit code (no Firebase/Mongo writes) unless
**both** are true:

- `NODE_ENV=development`
- `ALLOW_DATABASE_SEED=true`

`NODE_ENV=production` is always refused. Safety is **not** inferred from the
database hostname.

### Command

From the repository root:

```bash
npm run seed:database:all
```

Uses `NestFactory.createApplicationContext` (no HTTP/GraphQL server). Safe to
rerun; the second and third runs should report mostly **reused** counts.

### Demo accounts (evaluation only)

| Email                | Role      | Notes                              |
| -------------------- | --------- | ---------------------------------- |
| `docent@howest.be`   | ADMIN     | Evaluator admin                    |
| `apotheker1@demo.be` | APOTHEKER | Happy path / near daily FLU limit  |
| `apotheker2@demo.be` | APOTHEKER | Weekly limit boundary (~195 doses) |
| `apotheker3@demo.be` | APOTHEKER | Empty history; skipped route stop  |
| `bezorger1@demo.be`  | BEZORGER  | Today route assignee               |
| `bezorger2@demo.be`  | BEZORGER  | Cross-authz isolation              |

Password: set `SEED_DEMO_PASSWORD` locally (never commit real values). Documented
assignment evaluation passwords belong in your local `.env` / dossier only —
they are **not** hardcoded in TypeScript.

### Expected dataset

- Application settings singleton (`Europe/Brussels`, closing `14:00`)
- Vaccines: Influenza, COVID-19 (low stock), MMR
- Stock reconciled to fixed targets (idempotent adjustment keys)
- Orders for today + tomorrow (deterministic ObjectIds); today orders planned
  into the generated route
- Active route templates for both couriers; bezorger1 template includes the
  empty pharmacy (skipped on generation)
- Persisted **ASSIGNED** delivery route for **today** only
- Tomorrow remains a **computed** `RoutePreview` (not persisted)
- No order is automatically marked **DELIVERED**

Today/tomorrow dates use `Europe/Brussels` via shared delivery-date utilities
(not UTC string slicing).

### Idempotency

Upsert by natural keys (`firebaseUid`, `userId`, `normalizedName`, singleton
key, fixed order ObjectIds, `(bezorgerProfileId, deliveryDate)`). Reruns do not
duplicate users, profiles, vaccines, stock adjustments, order/route history, or
active templates.

There is **no** `seed:reset` command: entities lack reliable seed-ownership
markers, so selective cleanup cannot be guaranteed. Use the normal seed to
reconcile the deterministic dataset, or clear Mongo collections manually in
development if needed. Firebase Auth accounts are never deleted by the seed.

### Verify

1. Run `npm run seed:database:all` twice; both exit 0; reused counts dominate.
2. Log in as each role and confirm settings, vaccines, stock, orders, templates,
   today route (ASSIGNED), and tomorrow preview.
3. Confirm no automatic DELIVERED orders and no duplicate Mongo documents for
   seed keys.

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

| Route                    | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `/auth/complete-profile` | Profile completion for Firebase-only accounts |
| `/profile`               | View and edit own profile                     |
| `/apotheker`             | Apotheker dashboard (role: APOTHEKER)         |
| `/apotheker/vaccines`    | Read-only active vaccine catalogue            |
| `/admin`                 | Admin dashboard (role: ADMIN)                 |
| `/admin/vaccines`        | Vaccine catalogue management (ADMIN)          |
| `/admin/settings`        | Application settings (ADMIN)                  |
| `/bezorger`              | Bezorger dashboard (role: BEZORGER)           |
| `/forbidden`             | Permission denied page                        |
| unknown paths            | 404 page                                      |

## Application User and roles (Phase 5)

Firebase proves **who** someone is; MongoDB stores **what they may do** in the
application.

| Concept            | Source                       | Used for                     |
| ------------------ | ---------------------------- | ---------------------------- |
| Firebase identity  | Firebase Auth token          | Login, Bearer verification   |
| Application `User` | MongoDB (`users` collection) | Profile, role, authorization |

### Self-registration

Public registration lets the user choose **`APOTHEKER`** or **`BEZORGER`** via
`SelfRegistrationRole` on `createOwnUser`. Clients cannot supply `ADMIN`,
`firebaseUid`, or `email`. Repeated `createOwnUser` is idempotent and never
changes an existing role.

If Firebase identity exists without a MongoDB `User`, `/auth/complete-profile`
asks for account type again (recovery), then creates the application user.

### Profile completion

**APOTHEKER** users without an `ApothekerProfile` are redirected to
`/auth/complete-profile` to collect pharmacy name and delivery address
(`completeApothekerProfile`).

**BEZORGER** users without a `BezorgerProfile` complete courier fields
(`displayName`, optional `vehicleLabel`) via `completeBezorgerProfile`.

Lifecycle: Firebase identity → `createOwnUser(selected role)` →
`completeApothekerProfile` or `completeBezorgerProfile`.

**ADMIN** does not require a role-specific profile and cannot self-register.

### Pharmacy and courier profiles (Phase 5 corrective)

| Entity             | Collection           | Link                          | Purpose                                             |
| ------------------ | -------------------- | ----------------------------- | --------------------------------------------------- |
| `Address`          | embedded             | on `ApothekerProfile`         | Delivery stop location                              |
| `ApothekerProfile` | `apotheker_profiles` | `userId` → `User.id` (unique) | Pharmacy identity for routing                       |
| `BezorgerProfile`  | `bezorger_profiles`  | `userId` → `User.id` (unique) | Courier identity for template ownership (Phase 11+) |

Address fields: `street`, `houseNumber`, `postalCode` (4-digit Belgian), `city`,
`country` (default `BE`). No coordinates in this phase.

**Existing orders:** `Order.apothekerId` continues to reference `User.id`. Do not
rewrite historical orders. Phase 11/12 join:

```
RouteTemplateStop.apothekerProfileId
  → ApothekerProfile.userId
  → Order.apothekerId
```

Helpers: `findApothekerProfileById`, `findApothekerProfileByUserId` (and bezorger
equivalents).

### GraphQL operations added

| Operation                   | Auth            | Purpose                                    |
| --------------------------- | --------------- | ------------------------------------------ |
| `createOwnUser`             | Firebase Bearer | Create application profile                 |
| `currentUser`               | Firebase Bearer | Load MongoDB user + resolved role profiles |
| `updateOwnUser`             | Firebase Bearer | Update first/last name                     |
| `currentApothekerProfile`   | APOTHEKER       | Own pharmacy profile (nullable)            |
| `completeApothekerProfile`  | APOTHEKER       | Create pharmacy profile (idempotent)       |
| `updateOwnApothekerProfile` | APOTHEKER       | Update pharmacy name/address               |
| `currentBezorgerProfile`    | BEZORGER        | Own courier profile (nullable)             |
| `completeBezorgerProfile`   | BEZORGER        | Create courier profile (idempotent)        |
| `updateOwnBezorgerProfile`  | BEZORGER        | Update courier fields                      |
| `apothekerProfiles`         | ADMIN           | List pharmacies (Phase 11 prep)            |
| `bezorgerProfiles`          | ADMIN           | List couriers (Phase 11 prep)              |
| `apothekerArea`             | APOTHEKER       | Phase 5 role proof                         |
| `adminArea`                 | ADMIN           | Phase 5 role proof                         |
| `bezorgerArea`              | BEZORGER        | Phase 5 role proof                         |

### Development role testing

There is no public role-promotion mutation. For local testing of ADMIN or
BEZORGER:

1. Register or complete a profile (creates APOTHEKER + later pharmacy profile).
2. Open **MongoDB Compass** → database `vaccin-delivery` → collection `users`.
3. Edit the `role` field to `ADMIN` or `BEZORGER`.
4. For BEZORGER, complete `/auth/complete-profile` to create `BezorgerProfile`.
5. Log out and back in (or refresh) so `currentUser` reloads.

### Manual runtime test

1. Start MongoDB and `npm run dev`.
2. Log in with an existing Phase 4 Firebase account → expect redirect to
   `/auth/complete-profile`.
3. Submit names + pharmacy/address → MongoDB `User` + one `ApothekerProfile`
   with matching `userId`.
4. Refresh → no repeat profile prompt; `/apotheker` works; `/admin` → `/forbidden`.
5. Edit pharmacy fields at `/profile` → persists after refresh.
6. Confirm existing orders still list; `Order.apothekerId` still equals `User.id`.
7. Promote a user to BEZORGER → complete courier profile → no redirect loop.
8. ADMIN is not forced into pharmacy completion.
9. Log out → application user state clears.
10. Register a new account → Firebase + User, then pharmacy completion.

PWA composables:

- `useFirebase` — authentication identity
- `useCurrentUser` — application profile, role, and role-specific profile completion

## Application settings and vaccine catalogue (Phase 6)

### Application settings

Global configuration stored as a **singleton** MongoDB record (`singletonKey:
default`). Defaults:

| Field                     | Default           | Meaning                                     |
| ------------------------- | ----------------- | ------------------------------------------- |
| `timezone`                | `Europe/Brussels` | IANA timezone (read-only in PWA this phase) |
| `orderingClosingTime`     | `14:00`           | Local wall-clock delivery cutoff (HH:mm)    |
| `weeklyWarningPercentage` | `90`              | Weekly limit warning threshold (1–100)      |
| `weeklyDoseCap`           | `200`             | Hard weekly dose limit per apotheker        |
| `dailyDoseCapPerType`     | `50`              | Hard daily dose limit per vaccine type      |

All authenticated users may read settings. Only **ADMIN** may update
`orderingClosingTime`, `weeklyWarningPercentage`, `weeklyDoseCap`, and
`dailyDoseCapPerType`.

Legacy singleton documents created before Phase 7 are automatically backfilled
with missing defaults on read (one repair write per document).

### Vaccine catalogue

| Field                   | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `name`                  | Display name (unique case-insensitively)           |
| `description`           | Short explanatory text                             |
| `manufacturer`          | Producer name                                      |
| `stockQuantity`         | Authoritative stock count (integer, ≥ 0)           |
| `stockWarningThreshold` | Per-vaccine low-stock threshold                    |
| `active`                | Whether the vaccine is available for future orders |

**Stock boundary:** `stockQuantity` on `Vaccine` is the authoritative balance.
Only **`StockService`** may change it. Vaccine create/update forms manage catalogue
metadata only (`createVaccine` always starts at `stockQuantity: 0`). Stock changes
use `adjustVaccineStock` and are recorded in immutable **`StockAdjustment`** rows.
Delivery-based deduction runs when an ADMIN marks an order `DELIVERED` (Phase 10).

**Active/inactive:** Prefer deactivation over deletion. Inactive vaccines remain
visible to ADMIN (`includeInactive: true`) but are hidden from APOTHEKER.

### GraphQL operations added

| Operation                   | Auth                       | Purpose                       |
| --------------------------- | -------------------------- | ----------------------------- |
| `applicationSettings`       | Firebase Bearer            | Read singleton settings       |
| `updateApplicationSettings` | ADMIN                      | Update settings and dose caps |
| `vaccines`                  | APOTHEKER, ADMIN, BEZORGER | List catalogue                |
| `vaccine`                   | APOTHEKER, ADMIN, BEZORGER | Load one vaccine              |
| `createVaccine`             | ADMIN                      | Create catalogue entry        |
| `updateVaccine`             | ADMIN                      | Update catalogue entry        |
| `setVaccineActive`          | ADMIN                      | Activate / deactivate         |

Domain errors: `VACCINE_NOT_FOUND`, `VACCINE_ALREADY_EXISTS`, `SETTINGS_INVALID`.

PWA composables:

- `useApplicationSettings` — load and update settings
- `useVaccines` — list and manage vaccines (ADMIN mutations)

### Manual runtime test (Phase 6)

1. Log in as ADMIN (promote role in MongoDB if needed).
2. Open `/admin/settings` — confirm defaults: Europe/Brussels, 14:00, 90.
3. Change closing time or warning percentage, save, refresh — confirm persistence.
4. Open `/admin/vaccines` — create at least two vaccines.
5. Confirm duplicate normalized names are rejected.
6. Edit one vaccine; deactivate another.
7. Confirm ADMIN still sees inactive entries.
8. Log in as APOTHEKER → `/apotheker/vaccines` shows active vaccines only.
9. Confirm no management controls for APOTHEKER.
10. Attempt an ADMIN mutation as APOTHEKER via GraphQL → `Forbidden`.

## Pharmacist ordering and weekly controls (Phase 7)

### Ordering workflow

1. Authenticated **APOTHEKER** selects active vaccines and positive integer
   quantities on `/apotheker/orders/new`.
2. Server validates vaccines, limits, closing time, and derives ownership from
   `@CurrentUser()` — clients never send `apothekerId`, `status`, or timestamps.
3. Order is persisted as **`PENDING`** with embedded `orderLines`, server-calculated
   `totalQuantity`, `isoWeek`, `isoYear`, and `deliveryDate`.
4. **Stock is not deducted** in this phase.

### Order statuses

| Status      | Phase 7 behaviour                                          |
| ----------- | ---------------------------------------------------------- |
| `PENDING`   | Created by apotheker; may be cancelled by owner            |
| `PLANNED`   | Enum exists; transitions deferred to route-planning        |
| `DELIVERED` | Enum exists; completion deferred to delivery phases        |
| `CANCELLED` | Set by apotheker for eligible orders; excluded from totals |

### Ownership rules

- `apothekerId` references the MongoDB `User._id` of the authenticated APOTHEKER.
- `myOrders`, `myOrder`, `myWeeklyOrderSummary`, and `cancelOwnOrder` enforce
  ownership server-side.
- Cross-user order access returns generic `ORDER_NOT_FOUND`.

### ISO week behaviour

- ISO 8601 week (Monday–Sunday) derived from the server-calculated
  **`deliveryDate`** (not submission time).
- Both `isoWeek` and `isoYear` are stored on each order at creation.
- Weekly totals aggregate non-`CANCELLED` orders in the same ISO week/year.

### Closing-time and delivery-date policy

Uses `ApplicationSettings.orderingClosingTime` (default `14:00`) and
`timezone` with `Intl` (DST-safe; no fixed UTC offset). Implemented in
`delivery-date.util.ts`:

| Local submission time | Result                                      |
| --------------------- | ------------------------------------------- |
| Before closing        | Accepted; `deliveryDate` = today (local)    |
| Exactly at closing    | Accepted; `deliveryDate` = tomorrow (local) |
| After closing         | Accepted; `deliveryDate` = tomorrow (local) |

Closing time determines **delivery date**, not whether ordering is allowed.

### Limit aggregation date

Daily and weekly hard limits are calculated against the computed
**`deliveryDate`** because an order represents doses to be delivered on that
date (per fiche). Cancelled orders are excluded. Multiple orders for the same
delivery date accumulate.

### Weekly warning versus hard limit

| Concept                      | Source                         | Phase 7 behaviour                         |
| ---------------------------- | ------------------------------ | ----------------------------------------- |
| Weekly warning threshold     | `weeklyWarningPercentage` (90) | `warningReached` in `WeeklyOrderSummary`  |
| Weekly hard limit            | `weeklyDoseCap` (200)          | `WEEKLY_LIMIT_EXCEEDED` blocks submission |
| Daily hard limit per vaccine | `dailyDoseCapPerType` (50)     | `DAILY_LIMIT_EXCEEDED` blocks submission  |

Both hard limits are configurable by ADMIN in `/admin/settings`.

### Duplicate line handling

Duplicate `vaccineId` entries in one submission are **merged deterministically**
(quantities summed) in `OrderService` and mirrored in the PWA form.

### Cancellation rules

- APOTHEKER may cancel **own** `PENDING` orders only.
- `PLANNED` / `DELIVERED` → `ORDER_CANNOT_BE_CANCELLED`.
- Repeat cancel on `CANCELLED` order returns the order idempotently (no error).
- Records are retained; `cancelledAt` is set.

### ADMIN overview

- `/admin/orders` lists all orders (read-only).
- Filters: ISO year/week, status, apotheker.
- No route planning, status transitions, or stock changes.

### Concurrency limitation

Two simultaneous submissions from the same apotheker may both pass the pre-insert
limit read (documented MVP race; no MongoDB transactions or distributed locks).

### GraphQL operations added

| Operation              | Auth      | Purpose                   |
| ---------------------- | --------- | ------------------------- |
| `createOrder`          | APOTHEKER | Place order               |
| `myOrders`             | APOTHEKER | Own order history         |
| `myOrder`              | APOTHEKER | Own order detail          |
| `myWeeklyOrderSummary` | APOTHEKER | Weekly usage summary      |
| `cancelOwnOrder`       | APOTHEKER | Cancel eligible own order |
| `orders`               | ADMIN     | All orders with filters   |
| `order`                | ADMIN     | Single order inspection   |

Domain errors: `ORDER_NOT_FOUND`, `ORDER_CANNOT_BE_CANCELLED`,
`INVALID_ORDER_QUANTITY`, `WEEKLY_LIMIT_EXCEEDED`, `DAILY_LIMIT_EXCEEDED`,
`VACCINE_NOT_FOUND`, `VACCINE_INACTIVE`.

PWA composables:

- `useOrders` — create, list, weekly summary, cancel, admin overview

### Manual runtime test (Phase 7)

1. Ensure at least two active vaccines exist (ADMIN `/admin/vaccines`).
2. Log in as APOTHEKER.
3. Set closing time a few minutes **after** current Brussels time in
   `/admin/settings`.
4. Create an order → confirm `deliveryDate` is **today** in order history.
5. Set closing time a few minutes **before** current Brussels time.
6. Create another valid order → confirm it is **accepted** with
   `deliveryDate` = **tomorrow**.
7. Confirm neither order changes `Vaccine.stockQuantity`.
8. Restore closing time to `14:00`.
9. Confirm weekly summary updates; warning at ≥ 90% of `weeklyDoseCap`.
10. Cancel an order → `CANCELLED`; weekly total decreases.
11. Log in as ADMIN → both orders visible at `/admin/orders` with delivery dates.
12. APOTHEKER GraphQL `orders` query → `Forbidden`.

## Real-time order updates and notifications (Phase 8)

### Transport

| Channel   | URL / protocol                                        | Purpose                                  |
| --------- | ----------------------------------------------------- | ---------------------------------------- |
| HTTP      | `VITE_BACKEND_URL` (`http://localhost:3000/graphql`)  | Queries and mutations                    |
| WebSocket | `VITE_BACKEND_WS_URL` (`ws://localhost:3000/graphql`) | GraphQL subscriptions via **graphql-ws** |

The PWA Apollo Client uses a **split link**: HTTP for queries/mutations, WebSocket for
subscriptions. If `VITE_BACKEND_WS_URL` is omitted, the PWA derives a `ws://` URL from
`VITE_BACKEND_URL`.

### WebSocket authentication

- Firebase ID tokens are sent in WebSocket `connectionParams`:
  `Authorization: Bearer <token>`.
- Tokens are retrieved dynamically from the Firebase client SDK on connect and reconnect.
- Tokens are **not** stored manually in `localStorage`.
- The API verifies tokens with `FirebaseService` and loads the application `User` on connect.
- Invalid, expired, or unregistered identities are rejected safely.

### Subscription operations

| Operation              | Roles            | Purpose                                    |
| ---------------------- | ---------------- | ------------------------------------------ |
| `orderCreated`         | APOTHEKER, ADMIN | New order persisted                        |
| `orderUpdated`         | APOTHEKER, ADMIN | Cancellation or other Phase 7 update       |
| `notificationReceived` | APOTHEKER        | Persisted notification for the owning user |

Server-side filters ensure:

- **APOTHEKER** receives only orders where `order.apothekerId` matches the authenticated user.
- **APOTHEKER** receives only notifications where `recipientUserId` matches the authenticated user.
- **ADMIN** receives all order events but **not** pharmacist-private notifications in this phase.
- **BEZORGER** cannot subscribe (forbidden by role guard).

### Persisted notifications

Notifications are stored in MongoDB (`notifications` collection) and published over
WebSocket only **after** persistence.

| Field              | Purpose                                                       |
| ------------------ | ------------------------------------------------------------- |
| `recipientUserId`  | Owning application `User` (MongoDB id)                        |
| `type`             | `ORDER_CONFIRMATION`, `WEEK_LIMIT_WARNING`, `ORDER_CANCELLED` |
| `title`, `body`    | User-facing message (delivery date in confirmation body)      |
| `relatedOrderId`   | Optional link to the originating order                        |
| `deduplicationKey` | Prevents duplicate rows for the same logical event            |
| `readAt`           | Null = unread; GraphQL `read` is derived from this            |
| `createdAt`        | Creation timestamp                                            |

**Creation rules:**

- Successful order create → `ORDER_CONFIRMATION` (includes order id, total quantity, delivery date).
- Real `PENDING` → `CANCELLED` transition → `ORDER_CANCELLED` (idempotent repeats do not duplicate).
- Weekly usage crossing `ApplicationSettings.weeklyWarningPercentage` → one `WEEK_LIMIT_WARNING`
  per user / ISO year / ISO week / threshold (deduplication key:
  `weekly-warning:<userId>:<isoYear>:<isoWeek>:<threshold>`). Further orders in the same
  warning state in that week do not create another warning.

**GraphQL operations (APOTHEKER only):**

- `myNotifications(unreadOnly)` — list own notifications, newest first.
- `myUnreadNotificationCount` — unread badge count.
- `markNotificationRead(id)` — ownership enforced; foreign IDs return `NOTIFICATION_NOT_FOUND`.

### Read/unread and reconnect

- Mark-as-read sets `readAt` and decreases the unread badge live.
- On WebSocket **reconnect**, the PWA refetches persisted state:
  `myNotifications`, `myUnreadNotificationCount`, `myOrders`, and `myWeeklyOrderSummary`.
  This recovers events missed while the in-memory PubSub could not deliver across restarts.
- On logout, the WebSocket is disposed, Apollo cache cleared, and notification state reset.

### PubSub limitation

The API uses an **in-memory `PubSub`** (`graphql-subscriptions`) suitable for single-instance
development. This does **not** scale across multiple API instances; production would require
Redis or another shared broker (deferred to a later phase). Persisted notifications ensure
clients can recover after reconnect even when live events were missed.

### PWA live pages

- `/apotheker/orders` — subscribes to own order create/update events.
- `/apotheker/notifications` — notification list, mark-as-read, unread badge in header.
- `/admin/orders` — subscribes to all order create/update events (respects active filters).
- `CommonRealtimeStatus` shows connecting / connected / reconnecting / unavailable states.
- HTTP order and notification operations continue to work when WebSocket is temporarily unavailable.

### Environment

```env
VITE_BACKEND_URL=http://localhost:3000/graphql
VITE_BACKEND_WS_URL=ws://localhost:3000/graphql
```

### Manual two-user runtime test (Phase 8)

**Orders (two sessions):**

1. Open one **ADMIN** browser session on `/admin/orders`.
2. Open one **APOTHEKER** session (separate profile) on `/apotheker/orders`.
3. Create an order as APOTHEKER → confirm it appears on both screens without refresh.
4. Cancel the order → confirm both views update live.
5. Log in as a **second APOTHEKER** and create an order → first APOTHEKER must not receive it; ADMIN must.

**Notifications (APOTHEKER A vs B):**

6. APOTHEKER A: open `/apotheker/notifications` and create a valid order → persisted
   notification appears live; unread badge increases; body includes delivery date.
7. Mark read → unread count decreases; refresh → read state persists.
8. APOTHEKER B with notifications open → must not see A’s notifications.

**Weekly warning:**

9. Cross `weeklyWarningPercentage` once in an ISO week → one warning notification.
10. Place another order while still above threshold in the same week → no duplicate warning.

**Cancellation:**

11. Cancel an eligible order → one cancellation notification; idempotent cancel → no duplicate.

**Reconnect and logout:**

12. Restart the API → realtime status reconnects; notifications and orders refetch from MongoDB.
13. Log out → badge and notification state clear; log in as another user → only that user’s data loads.

## API commands

```bash
npm run dev:api
npm run build:api
npm run lint:api
npm run typecheck:api
npm run test:api
npm run test:e2e:api
npm run generate:schema
```

## Backend GraphQL E2E (Phase 17)

### Purpose

GraphQL E2E tests hit the real NestJS GraphQL HTTP boundary (`POST /graphql`)
with Supertest. They prove authentication, authorization, ownership, Mongo
persistence, domain validation, safe errors, and idempotent side effects across
Phases 1–16.

### Unit vs E2E

| Suite                    | Command                | What it covers                                                                         |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------- |
| Unit / integration specs | `npm run test:api`     | Fast Jest tests under `packages/api/src/**/*.spec.ts` (mocked repos where appropriate) |
| GraphQL E2E              | `npm run test:e2e:api` | Full AppModule + real Mongo + GraphQL HTTP (Firebase verify mocked only)               |

E2E is **not** folded into every unit-test run.

### Isolated database

- Jest `globalSetup` starts **MongoMemoryServer**.
- Database name: `vaccin_delivery_e2e_test` (must contain `_test` or `e2e`).
- Collections are cleared between scenarios; developer/production DBs are never targeted.
- Hard safety: wipe/clear aborts if `DB_NAME` lacks a test marker.
- When `NODE_ENV=test`, AppModule ignores `.env` so local `DB_NAME=vaccin-delivery` cannot leak in.

### Firebase override

- Live Firebase Admin is never used (`NODE_ENV=test` skips SDK init; E2E replaces `FirebaseService.verifyIdToken`).
- Deterministic tokens: `e2e-admin`, `e2e-apotheker-1`, `e2e-apotheker-2`, `e2e-bezorger-1`, `e2e-bezorger-2`, `e2e-unregistered`.
- Real `AuthorizationGuard`, `RolesGuard`, and Mongo `User` resolution remain in the path.

### Command

```bash
npm run test:e2e:api
```

Workspace equivalent: `npm run test:e2e --workspace=@vaccin-delivery/api`.

### Covered workflows

Auth/users, cross-role authz, settings/vaccines, stock adjustments, orders +
delivery stock decrement idempotency, route templates/generation, tomorrow
preview (no persistence), route lifecycle, notifications, safe GraphQL errors,
and E2E infrastructure safety checks.

### Known exclusions

- Full WebSocket subscription E2E (HTTP GraphQL coverage is Phase 17 focus; unit filters remain)
- CI `ci-api-e2e` / `ci-playwright` workflow hardening (Phase 20)
- Production Docker stack (Phase 19)

## Playwright browser E2E (Phase 18)

### Purpose

Playwright drives the real Vue UI against the real Nest GraphQL API to prove
critical user journeys (login, role navigation, ordering, route lifecycle,
offline login UX, PWA manifest/SW smoke).

### Difference from API E2E

| Suite          | Command                | Boundary                              |
| -------------- | ---------------------- | ------------------------------------- |
| GraphQL E2E    | `npm run test:e2e:api` | HTTP GraphQL + Supertest (no browser) |
| Playwright E2E | `npm run test:e2e:pwa` | Chromium + Vue UI + GraphQL API       |

### Browser / environment strategy

- **Chromium** baseline (`@playwright/test`)
- API on port **3100**, PWA preview on **4174** (separate from dev 3000/5173)
- Isolated **MongoMemoryServer** database `vaccin_delivery_playwright_e2e`
- `workers: 1` because suites share one API process and reset fixtures via
  `POST /__e2e__/reset` (only registered when the Playwright stack is running)
- Artifacts: `playwright-report/`, `test-results/` (gitignored)

### Authentication approach

Controlled **test-only auth bypass** (not Firebase emulator, not personal accounts):

| Layer    | Gate                                                                  |
| -------- | --------------------------------------------------------------------- |
| Backend  | `NODE_ENV=test` **and** `ALLOW_E2E_AUTH_BYPASS=true`                  |
| Frontend | `VITE_E2E_AUTH_BYPASS=true` on the Playwright Vite build/preview only |

Deterministic tokens/emails mirror Phase 17 (`e2e-admin@example.com`, …).
Guards, Mongo roles, and ownership stay real. Production builds omit the Vite
flag; the backend bypass never activates when `NODE_ENV` is `development` or
`production`.

No passwords, tokens, or private keys are committed. Bypass passwords in tests
are local placeholders and are not verified against Firebase.

### Fixture data

Focused Playwright seed (not Phase 15 CLI, not developer DB): 1 admin, 2
apothekers, 2 bezorgers, settings, vaccines/stock, orders, route templates,
today’s persisted route, tomorrow preview inputs. Reset before each test.

### Commands

```bash
# Install browsers once
npx playwright install chromium

# Headless suite (starts API stack + PWA preview via webServer)
npm run test:e2e:pwa

# Interactive UI mode
npm run test:e2e:pwa:ui

# Open last HTML report
npm run test:e2e:pwa:report
```

### Artifact locations

| Path                 | Contents                    |
| -------------------- | --------------------------- |
| `playwright-report/` | HTML report                 |
| `test-results/`      | Traces, screenshots, videos |

### Known limitations

- Auth bypass is intentional for CI-stable browser tests; it is dual-gated and
  inactive in normal development/production.
- Service worker checks require the production-like preview build (not `vite` dev).
- Install-prompt UX is not automated (browser automation limitation).
- Playwright CI workflow file lands in Phase 20.

## PWA commands

```bash
npm run dev:pwa
npm run build:pwa
npm run preview --workspace=@vaccin-delivery/pwa
npm run lint:pwa
npm run typecheck:pwa
npm run test:pwa
```

## Progressive Web App (Phase 16)

### What is provided

| Capability       | Behaviour                                                                  |
| ---------------- | -------------------------------------------------------------------------- |
| Web app manifest | `Vaccinatie-levering` / short name `Vaccin`, `display: standalone`         |
| Icons            | 192×192, 512×512, maskable 512, favicon under `packages/pwa/public/`       |
| Service worker   | `vite-plugin-pwa` + Workbox, **production builds** (see below for dev)     |
| Precache         | Built JS/CSS/HTML shell, icons, `offline.html` only                        |
| Runtime cache    | **None** — no GraphQL, Firebase Auth, or private API caching               |
| Offline UI       | Banner: live data and actions temporarily unavailable                      |
| Offline fallback | `/offline.html` for failed navigations when the network is down            |
| Reconnect        | Browser `online` + WebSocket reconnect refetch critical authenticated data |
| Update prompt    | “Er is een nieuwe versie beschikbaar.” → **Bijwerken**                     |
| Install prompt   | Optional “App installeren” when Chromium fires `beforeinstallprompt`       |

### Install prerequisites

- Chromium-based browser (Chrome / Edge) over **HTTPS** or `localhost`
- Production build served (manifest + service worker emitted by `vite build`)
- Valid icons and manifest (no DevTools Application errors)

### Service-worker strategy

- `registerType: 'prompt'` — user confirms before a waiting worker activates
- Precache: revisioned static build assets only (including `index.html` and
  `offline.html`)
- `navigateFallback: '/index.html'` for Vue Router history routes (never
  `/offline.html`)
- `navigateFallbackDenylist` excludes `/api` and `/graphql`
- Navigations also use Workbox `NetworkOnly` + `precacheFallback` →
  `/offline.html` **only** after a genuine network failure
- API / GraphQL / Firebase Auth are **not** runtime-cached
- **No** offline mutation queue
- **No** authenticated route/order/stock response caching
- Development (`npm run dev`) keeps the service worker **disabled** unless
  `VITE_PWA_DEV=true` — offline refresh in dev uses the browser native page

### Offline fallback recovery

`/offline.html` is a static page. **Opnieuw proberen** and the browser `online`
event both call `location.replace('/')` so the SPA can load again. Do not reload
the offline document itself.

After changing SW config, unregister any old `localhost` service worker and clear
site data once so a previous `/offline.html` NavigationRoute cannot stick.

### Offline limitations

When offline:

- The previously loaded app shell may open
- Live route/order/stock data is **not** treated as freshly authoritative
- Mutation controls (orders, stock, route status, settings, profile) are disabled
- Login/register require network
- Failed navigations can show `/offline.html`

### Reconnect behaviour

When connectivity returns, a centralized handler refetches data already registered
via `registerReconnectHandler` (current user notifications, today route, tomorrow
preview, admin feeds, etc.) and Apollo subscriptions reconnect as before.

### Update behaviour

A new production deploy registers a waiting service worker. The in-app banner
offers **Bijwerken**, which activates the worker and reloads. The app does not
auto-reload during an active mutation.

### Install flow

1. Build and serve the production PWA (`npm run build:pwa` then preview).
2. Open the app in Chromium → DevTools → Application → Manifest / Service Workers.
3. Use the browser install affordance or the in-app **App installeren** control when shown.
4. Launch in standalone mode and confirm role navigation still works.

### Testing with DevTools

1. `npm run build:pwa`
2. `npm run preview --workspace=@vaccin-delivery/pwa`
3. Application → Manifest: name, icons, no errors
4. Application → Service Workers: registered
5. Network → Offline → reload: shell or offline page + offline banner; no GraphQL flood
6. Network → Online: banner clears; data refetches
7. Cache Storage: confirm **no** GraphQL bodies, tokens, orders, routes, or stock records
8. Deploy a new build and confirm the update banner appears

### Unregistering a stale service worker

If a development or old worker interferes:

1. DevTools → Application → Service Workers → **Unregister**
2. Application → Storage → **Clear site data** (optional)
3. Hard-reload the page

Development mode does **not** register a service worker unless you set
`VITE_PWA_DEV=true` when starting Vite.

### Excluded from Phase 16

- Offline order creation / mutation queues
- Background sync of authenticated mutations
- Authenticated courier-route Cache API storage
- Push notifications
- Playwright installability suite (Phase 18) — see `npm run test:e2e:pwa`

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

## Stock management (Phase 9)

### Authoritative balance and audit

| Concept                  | Role                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `Vaccine.stockQuantity`  | Current authoritative balance                                          |
| `StockAdjustment`        | Immutable audit history — never summed to derive balance               |
| `StockService`           | Sole writer of `stockQuantity`                                         |
| `VaccineStockRepository` | Atomic MongoDB `findOneAndUpdate` with conditional guard for decreases |

### StockAdjustment fields

| Field                              | Purpose                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `vaccineId`                        | Which vaccine changed                                                       |
| `type`                             | `RESTOCK`, `MANUAL_DECREASE`, `MANUAL_CORRECTION`, or `DELIVERY_DEDUCTION`  |
| `quantityDelta`                    | Signed change applied (non-zero); not used as input for `MANUAL_CORRECTION` |
| `targetQuantity`                   | Input for `MANUAL_CORRECTION` — sets stock to this absolute amount          |
| `quantityBefore` / `quantityAfter` | Server snapshots from successful atomic update                              |
| `reason`                           | Required free-text admin explanation                                        |
| `performedByUserId`                | Derived from `@CurrentUser()`                                               |
| `relatedOrderId`                   | Set for `DELIVERY_DEDUCTION`; null for manual ops                           |
| `idempotencyKey`                   | `delivery-decrement:{orderId}:{vaccineId}` for delivery; omitted for manual |
| `createdAt`                        | Server timestamp                                                            |

### Adjustment rules

- `RESTOCK` requires positive `quantityDelta`
- `MANUAL_DECREASE` requires negative `quantityDelta`
- `MANUAL_CORRECTION` requires non-negative `targetQuantity` and sets stock to that absolute amount (delta = target − current)
- Zero delta rejected (`INVALID_STOCK_ADJUSTMENT`)
- Resulting negative stock blocked (`INSUFFICIENT_STOCK`)
- Negative adjustments use one conditional DB update; concurrent decreases cannot go below zero

### Low-stock notifications

After each successful adjustment, when **`quantityBefore > stockWarningThreshold`**
and **`quantityAfter <= stockWarningThreshold`**, a `LOW_STOCK_WARNING` notification
is persisted for each ADMIN user and published via the existing `notificationReceived`
subscription.

**Episode deduplication:** only the threshold-crossing adjustment creates a warning.
Further adjustments while already low do not spam. After recovery above the threshold,
a later crossing creates a new episode with key `low-stock:{vaccineId}:{crossingAdjustmentId}`.

ADMIN notifications are role-filtered — apotheker order notifications never leak to
ADMIN subscriptions and vice versa.

### GraphQL operations added

| Operation                                  | Auth             | Purpose                                 |
| ------------------------------------------ | ---------------- | --------------------------------------- |
| `adjustVaccineStock`                       | ADMIN            | Adjust stock + append audit             |
| `stockAdjustments`                         | ADMIN            | List adjustments (optional `vaccineId`) |
| `vaccineStockHistory`                      | ADMIN            | History for one vaccine                 |
| `myNotifications` / `notificationReceived` | ADMIN (extended) | Low-stock alerts                        |

Domain errors: `VACCINE_NOT_FOUND`, `INVALID_STOCK_ADJUSTMENT`, `INSUFFICIENT_STOCK`,
`FORBIDDEN`, `UNAUTHENTICATED`.

PWA composables and screens:

- `useStock` — overview, adjust, history
- `useAdminNotifications` — ADMIN low-stock alerts
- `/admin/stock` — stock management
- `/admin/stock/:vaccineId/history` — read-only audit history
- `/admin/notifications` — ADMIN operational alerts

APOTHEKER sees current `stockQuantity` on `/apotheker/vaccines` (read-only). No stock
mutation or history access for APOTHEKER or BEZORGER.

### Consistency limitation

The vaccine balance update and `StockAdjustment` insert are **not** wrapped in a
multi-document MongoDB transaction. A process crash between them could leave a changed
balance without its audit row (accepted single-instance MVP limitation).

### Manual runtime test (Phase 9)

1. Log in as ADMIN → `/admin/stock`.
2. Restock a vaccine — confirm balance, one audit row, correct before/after.
3. Decrease stock — confirm negative resulting balance is rejected.
4. Perform a correction with a reason.
5. Open history — confirm immutable ordered records.
6. Log in as APOTHEKER — confirm no stock controls or history.
7. Attempt `adjustVaccineStock` as APOTHEKER → `FORBIDDEN`.
8. Adjust to the warning threshold — confirm ADMIN low-stock notification (persisted + live).
9. Adjust again while still low — no duplicate spam.
10. Restock above threshold, then drop below again — new notification allowed.
11. Place an order — confirm stock unchanged.

## Admin order management and delivery (Phase 10)

### Order finite-state machine

| From                      | To          | Actor                                 | Stock change          |
| ------------------------- | ----------- | ------------------------------------- | --------------------- |
| —                         | `PENDING`   | system (create)                       | none                  |
| `PENDING`                 | `PLANNED`   | ADMIN                                 | none                  |
| `PENDING`                 | `DELIVERED` | ADMIN (shortcut)                      | decrement on delivery |
| `PENDING`                 | `CANCELLED` | ADMIN / APOTHEKER (own, PENDING only) | none                  |
| `PLANNED`                 | `DELIVERED` | ADMIN                                 | decrement on delivery |
| `PLANNED`                 | `CANCELLED` | —                                     | **forbidden**         |
| `DELIVERED` / `CANCELLED` | any         | —                                     | terminal              |

Display mapping: `PENDING` and `PLANNED` → _in behandeling_; `DELIVERED` → _geleverd_.

### Delivery stock decrement

- Runs **only** when an ADMIN transitions an order to `DELIVERED` (not on create or `PLANNED`).
- All decrements go through `StockService.applyDeliveryDecrement`.
- Pre-validates every vaccine line; on failure **no** balance change, **no** audit row, **no** notification, **no** realtime event.
- On partial failure mid-decrement, earlier balance changes are **rolled back** before the error is returned.
- Audit rows use type `DELIVERY_DEDUCTION` with idempotency key `delivery-decrement:{orderId}:{vaccineId}`.

### Idempotency

- Repeat delivery when `status === DELIVERED` and `stockDecrementedAt` is set → success, no second decrement.
- Persisted `StockAdjustment.idempotencyKey` and notification deduplication key `order-delivered:{orderId}` prevent duplicates on retry.
- Idempotent same-status requests append no duplicate status history and publish no events.

### Status history

Embedded `statusHistory` on each order: `fromStatus`, `toStatus`, `changedAt`, `changedByUserId`, optional `reason`. Clients cannot supply history metadata. Legacy orders without history are normalized once on first read (PENDING/CANCELLED/DELIVERED reconstructed from available timestamps; `stockDecrementedAt` is **not** invented for legacy `DELIVERED` records).

### Admin GraphQL

| Operation                                 | Purpose                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `adminDailyOrderOverview(deliveryDate)`   | Fulfilment totals by delivery date (cancelled excluded from active totals) |
| `adminWeeklyStatistics(isoYear, isoWeek)` | Weekly aggregates by delivery-date ISO week                                |
| `adminOrders(...)`                        | Filtered order list                                                        |
| `updateOrderStatus(id, status, reason?)`  | ADMIN FSM transitions                                                      |
| `cancelOrder(id, reason?)`                | ADMIN cancel from `PENDING` only                                           |
| `adminOperationsFeed`                     | Live `NEW_ORDER`, `ORDER_STATUS_CHANGED`, `LOW_STOCK` for ADMIN            |

### Consistency limitation

Without multi-document MongoDB transactions, a **process crash** between balance rollback/decrement steps and audit insert remains a minimal residual risk. Normal failure paths roll back all balance changes before returning an error. Partial stock loss on insufficient stock is **not** accepted.

### Manual runtime test (Phase 10)

1. Ensure an APOTHEKER has a `PENDING` order with sufficient stock.
2. Log in as ADMIN → `/admin/orders`.
3. Move the order to `PLANNED` — confirm no stock change.
4. Mark `DELIVERED` — confirm one decrement per vaccine, `DELIVERY_DEDUCTION` audit rows, `stockDecrementedAt`, status history.
5. Repeat mark-delivered — no second decrement, notification, or event.
6. In another browser profile (APOTHEKER), confirm live status + one `ORDER_DELIVERED` notification.
7. Attempt delivery with insufficient stock — order unchanged, no audit rows.
8. Cancel an eligible `PENDING` order — no stock change, one cancellation notification.
9. Verify daily overview and weekly statistics; confirm `adminOperationsFeed` events.
10. Confirm APOTHEKER cannot call ADMIN mutations; BEZORGER cannot subscribe to `adminOperationsFeed`.

## Route templates (Phase 11)

Reusable delivery plans stored as `RouteTemplate` with embedded
`RouteTemplateStop` entries. Templates are configuration only — no daily
`DeliveryRoute`, preview, order assignment, or stock side effects.

### Domain model

| Field / entity       | Notes                                                               |
| -------------------- | ------------------------------------------------------------------- |
| `RouteTemplate.name` | Display name (trimmed)                                              |
| `normalizedName`     | Unique key: trim + collapse whitespace + case-fold (not client-set) |
| `description`        | Optional                                                            |
| `active`             | Soft lifecycle; no hard delete                                      |
| `bezorgerProfileId`  | → `BezorgerProfile.id`                                              |
| `stops[]`            | Embedded; `apothekerProfileId` + server `sequence` `1..n`           |
| Audit                | `createdAt` / `updatedAt` / `createdByUserId` / `updatedByUserId`   |

Ownership bridge for later generation:

`RouteTemplateStop.apothekerProfileId` → `ApothekerProfile.userId` → `Order.apothekerId`.

**Storage note (Phase 12 fix):** `Order.apothekerId` is persisted as a MongoDB
`ObjectId` (`user._id` on create). `ApothekerProfile.userId` is a string.
Route generation converts the profile `userId` to `ObjectId` via
`findQualifyingOrdersForRoute` before matching.

### Validation

- ADMIN-only GraphQL CRUD
- Unique normalized names (duplicate-key mapped to `ROUTE_TEMPLATE_ALREADY_EXISTS`)
- Courier and pharmacist profile IDs must exist
- No duplicate pharmacies in one template (`ROUTE_TEMPLATE_DUPLICATE_STOP`)
- At least one stop required (`ROUTE_TEMPLATE_EMPTY_STOPS`)
- Sequence rewritten from array order; responses ordered by `sequence`
- Clients cannot supply audit identity, timestamps, `normalizedName`, or sequence

### GraphQL operations

| Operation                                          | Auth  | Purpose                             |
| -------------------------------------------------- | ----- | ----------------------------------- |
| `routeTemplates(includeInactive: Boolean = false)` | ADMIN | List templates                      |
| `routeTemplate(id)`                                | ADMIN | Single template                     |
| `createRouteTemplate(input)`                       | ADMIN | Create with courier + stops         |
| `updateRouteTemplate(id, input)`                   | ADMIN | Edit name/description/courier/stops |
| `setRouteTemplateActive(id, active)`               | ADMIN | Activate / deactivate               |

### PWA

- `/admin/route-templates` — list, create/edit, reorder stops (move up/down),
  activate/deactivate, optional inactive inclusion
- Display pharmacy name/address and courier display name from profile queries
- Persist only profile IDs

### Manual runtime test (Phase 11)

1. Create at least two `ApothekerProfile`s and one `BezorgerProfile`.
2. Log in as ADMIN → `/admin/route-templates`.
3. Create a template with one courier and at least three pharmacies.
4. Refresh — confirm persistence and stop order.
5. Reorder stops and refresh.
6. Edit name, description, courier, and stops.
7. Confirm duplicate name with different casing is rejected.
8. Confirm duplicate pharmacy stop is rejected.
9. Deactivate and reactivate the template.
10. Confirm APOTHEKER and BEZORGER cannot access template operations.
11. Confirm orders, stock, notifications, and delivery transitions are unchanged.

## Delivery routes (Phase 12)

Persisted daily plans. A `RouteTemplate` is reusable configuration; a
`DeliveryRoute` is the courier’s plan for one calendar date.

### DeliveryRoute versus RouteTemplate

|             | `RouteTemplate`                    | `DeliveryRoute`                                  |
| ----------- | ---------------------------------- | ------------------------------------------------ |
| Purpose     | Reusable stop order + courier link | One day plan for one courier                     |
| Persistence | Long-lived config                  | Upserted per `(bezorgerProfileId, deliveryDate)` |
| Stops       | Profile IDs only                   | **Snapshots** of pharmacy name, address, doses   |
| Orders      | None                               | Qualifying orders → `PLANNED`                    |

### Snapshot rationale

Each `DeliveryStop` copies pharmacy name and full `Address` at generation time.
Later edits to `ApothekerProfile` do not rewrite historical routes. Dose lines
are aggregated `OrderLineSnapshot`s (`vaccineId`, `vaccineName`, `manufacturer`,
`quantity`) — full `Order` entities are not embedded.

### Qualifying orders and skip rules

An order qualifies when:

- `deliveryDate` matches the requested `YYYY-MM-DD`;
- ownership: `Order.apothekerId` = `ApothekerProfile.userId` for the template stop;
- status is `PENDING` or `PLANNED`;
- not `CANCELLED` or `DELIVERED`.

Template stops without qualifying orders are omitted from `stops` and recorded in
`skippedApothekerProfileIds` (skipped **pharmacies**, not order IDs). Relative
template order is preserved; generated `sequence` is renormalized to `1..n`.

If every stop is skipped, an **empty route** is still persisted (`stops: []`) with
the full skipped list (FLOW-006). ADMIN and BEZORGER UIs show a meaningful empty
state — not an error.

### Order.apothekerId profile bridge

```
RouteTemplateStop.apothekerProfileId
  → ApothekerProfile.userId
  → Order.apothekerId
```

`Order.apothekerId` remains a **User** id (stored as MongoDB `ObjectId`); it is
not rewritten to a profile id. Route generation converts the profile `userId`
string to `ObjectId` when querying.

### Route uniqueness and regeneration

Unique compound index `(bezorgerProfileId, deliveryDate)` — at most one route per
courier per date. Regeneration updates the same document (stable id), refreshes
snapshots, and updates `generatedAt` / `generatedByUserId`.

Regeneration is allowed for `ASSIGNED` and `CANCELLED` (architecture §6.2).
`IN_PROGRESS` and `COMPLETED` are rejected (`DELIVERY_ROUTE_NOT_REGENERABLE`).
Orders that leave the route are **not** reverted from `PLANNED` to `PENDING`.

Initial `statusHistory` records `ASSIGNED` on first create (Phase 14 compatibility).
Clients cannot supply history metadata.

### PLANNED transition

Included orders move `PENDING → PLANNED` via `OrderService.planOrdersForGeneratedRoute`
(shared FSM / history logic). Already `PLANNED` orders stay planned without a
duplicate history entry. No stock change and no delivery notification.

Realtime publishing is deferred until the `DeliveryRoute` upsert succeeds:

1. persist order transitions silently;
2. upsert route;
3. publish `orderUpdated` for orders that actually changed;
4. publish `bezorgerRouteUpdates`.

If route persistence fails, **no** order or route realtime events are published.

### Courier ownership and realtime

| Operation                          | Auth                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| `generateDeliveryRoute`            | ADMIN                                                             |
| `deliveryRoutes` / `deliveryRoute` | ADMIN                                                             |
| `myTodayRoute`                     | BEZORGER (own profile + Europe/Brussels today)                    |
| `bezorgerRouteUpdates`             | BEZORGER; filter `route.bezorgerProfileId ===` subscriber profile |

`myTodayRoute` looks up `(bezorgerProfileId, deliveryDate)` with the same
**ObjectId/string-safe** dual match used for order ownership: persisted
`DeliveryRoute.bezorgerProfileId` is a string, while TypeORM `profile.id` may be
an `ObjectId` instance. A string-only or ObjectId-only query misses the route.

Reconnect refetches `myTodayRoute`.

### Consistency limitation

There is no multi-document MongoDB transaction. A crash after orders are saved as
`PLANNED` but before the route upsert can leave planned orders without an updated
route snapshot. Regeneration heals that state. Failed route writes do not emit
realtime events.

### PWA

- `/admin/route-planning` — date + active template, generate/regenerate with
  confirmation, stop list, skipped/empty-route messaging, routes for the date
- `/bezorger/today` — mobile-first today route, snapshotted address + doses,
  empty states, live subscription

### Manual runtime test (Phase 12)

1. Ensure one ADMIN, two BEZORGER profiles, several APOTHEKER profiles, active
   templates for both couriers, and a mix of qualifying / non-qualifying orders.
2. Log in as ADMIN → `/admin/route-planning`.
3. Generate a route for a selected date.
4. Confirm only pharmacies with qualifying orders appear; skipped list is set.
5. Confirm included orders become `PLANNED` and stock is unchanged.
6. Inspect MongoDB: one `DeliveryRoute`, correct courier/date, address snapshots,
   order IDs and quantities.
7. Regenerate — same document updated, no duplicate.
8. Cancel or add a qualifying order, regenerate, confirm recomputation.
9. Log in as the assigned BEZORGER → `/bezorger/today` shows the route.
10. Keep the page open; regenerate as ADMIN — realtime update without refresh.
11. Log in as the other BEZORGER — cannot see the first courier’s route.
12. Confirm APOTHEKER cannot generate routes; delivery marking still works.

## Tomorrow RoutePreview (Phase 13)

Live, **computed** courier preview for **tomorrow**. Never persisted.

### DeliveryRoute versus RoutePreview

|                | `DeliveryRoute`                                | `RoutePreview`                                        |
| -------------- | ---------------------------------------------- | ----------------------------------------------------- |
| Purpose        | Historical day plan after ADMIN generation     | Live vooruitblik for tomorrow                         |
| Persistence    | MongoDB document                               | GraphQL response only — **no collection / no entity** |
| Who creates it | ADMIN via `generateDeliveryRoute`              | Computed on `myTomorrowRoutePreview`                  |
| Snapshot       | Pharmacy name/address frozen at generation     | Current profile name/address at query time            |
| Side effects   | May set orders `PLANNED`, publish route events | **None** — read-only                                  |

Why preview is not persisted (ADR-015): it must reflect live orders until an
ADMIN generates a real `DeliveryRoute`. Persisting a preview would stale or
collide with generation.

### Tomorrow calculation

```
tomorrow = formatLocalDate(addLocalDays(getZonedDateParts(now, timezone), 1))
```

Timezone comes from `ApplicationSettings.timezone` (seeded `Europe/Brussels`).
Returns `YYYY-MM-DD`. Uses the injectable `CLOCK` in tests — not
`toISOString().slice(0, 10)`.

### Closing-time / cutoff rule (RULE-013)

Phase 7 still assigns `deliveryDate` via
`resolveDeliveryDate(submittedAt, timezone, orderingClosingTime)`:

- Before closing → `deliveryDate` = that local day
- At/after closing → `deliveryDate` = next local day

**Tomorrow preview is stricter than Phase 12 generation.** After loading
route-qualifying orders for `deliveryDate === tomorrow`, preview keeps only
orders whose `submittedAt` is **before** the configured closing time in
Europe/Brussels (`!isAtOrAfterClosingTime`). Exactly at closing is treated as
after closing (same boundary as Phase 7) and is **excluded**.

| Case                                                           | Preview  |
| -------------------------------------------------------------- | -------- |
| `deliveryDate === tomorrow` and submitted **before** closing   | included |
| `deliveryDate === tomorrow` and submitted **at/after** closing | excluded |
| Wrong `deliveryDate` / `CANCELLED` / `DELIVERED`               | excluded |

Phase 12 `generateDeliveryRoute` is unchanged and still includes post-closing
tomorrow orders. Under normal Phase 7 placement, same-day post-closing orders
are the usual `deliveryDate=tomorrow` set, so the live preview may be empty
until pre-closing fixtures/orders exist — by design (RULE-013).

### Qualifying statuses

Base set from Phase 12 `findQualifyingOrdersForRoute`, then RULE-013 filter:

- `PENDING` and `PLANNED` included (if pre-closing)
- `CANCELLED` and `DELIVERED` excluded
- Ownership: `Order.apothekerId` ↔ `ApothekerProfile.userId` (ObjectId-safe)

### Template ownership

```
authenticated User → BezorgerProfile → exactly one active RouteTemplate
  where template.bezorgerProfileId === profile.id
```

| Situation                      | Result                            |
| ------------------------------ | --------------------------------- |
| No BezorgerProfile             | `BEZORGER_PROFILE_NOT_FOUND`      |
| No active template             | `ROUTE_TEMPLATE_NOT_ASSIGNED`     |
| Multiple active templates      | `MULTIPLE_ACTIVE_ROUTE_TEMPLATES` |
| Template stop with zero orders | skipped (listed in skipped ids)   |

### Empty-preview behaviour

Assigned template + no qualifying orders → valid response with `stops: []`,
zero totals, and `skippedApothekerProfileIds` filled. Not an error.

### Lack of side effects

`myTomorrowRoutePreview` does **not**:

- create/update `DeliveryRoute`
- change `Order` status or history
- touch stock
- create notifications
- publish PubSub events

### Authorization

BEZORGER only (own profile). APOTHEKER and ADMIN are forbidden. No courier ID
argument — another courier cannot be selected.

### GraphQL / PWA

| Surface                  | Notes                                                 |
| ------------------------ | ----------------------------------------------------- |
| `myTomorrowRoutePreview` | `RoutePreview!` — server derives date/template        |
| `/bezorger/tomorrow`     | “Voorbeeldroute voor morgen” (vs “Route van vandaag”) |
| Reconnect                | Refetch preview (no preview subscription)             |

### Manual runtime test (Phase 13)

1. Ensure one BEZORGER has an active `RouteTemplate` with several pharmacies.
2. Create tomorrow-dated orders with `submittedAt` before vs after the configured
   closing time; confirm only **pre-closing** orders appear in the preview
   (post-closing `deliveryDate=tomorrow` orders are excluded — RULE-013).
3. Log in as BEZORGER → `/bezorger/tomorrow`.
4. Confirm template name, ordered stops, addresses, vaccine totals, order counts.
5. Confirm empty pharmacies are skipped; empty preview is a valid empty state.
6. Inspect MongoDB before/after opening the preview — no new/updated
   `DeliveryRoute`, unchanged order statuses/stock/notifications.
7. Confirm APOTHEKER/ADMIN cannot query `myTomorrowRoutePreview`.
8. Confirm `/bezorger/today` still works.

## Route execution lifecycle (Phase 14)

### Route FSM

| From                       | To            | Actor                     |
| -------------------------- | ------------- | ------------------------- |
| `ASSIGNED`                 | `IN_PROGRESS` | BEZORGER (own) or ADMIN   |
| `IN_PROGRESS`              | `COMPLETED`   | BEZORGER (own) or ADMIN   |
| `ASSIGNED` / `IN_PROGRESS` | `CANCELLED`   | ADMIN only                |
| `COMPLETED` / `CANCELLED`  | —             | terminal (no transitions) |

Same-status requests are **idempotent**: return the existing route, append no
history, publish no realtime event.

### Mutation

`updateRouteStatus(id, status, reason?)` — ADMIN or BEZORGER. Clients cannot
supply `changedByUserId`, timestamps, history, or courier ownership. BEZORGER
ownership is derived from the authenticated user → `BezorgerProfile` →
`DeliveryRoute.bezorgerProfileId` (ObjectId/string-safe).

### Status history

Immutable embedded `statusHistory` entries: `fromStatus` (nullable for initial
`ASSIGNED`), `toStatus`, `changedAt`, `changedByUserId`, optional `reason`.
Generation creates the initial `ASSIGNED` entry. Each real transition appends
exactly one entry. Legacy routes missing history are normalized on the next
real transition.

### Idempotency and concurrency

Transitions use a conditional MongoDB update matching `_id` + expected current
`status`. Concurrent duplicates: one wins; the loser reloads and returns an
idempotent result or a safe transition error. No duplicate history.

### Realtime

After a **persisted** status change, publish on `bezorgerRouteUpdates` (owning
courier only). Failed, unauthorized, invalid, and idempotent requests publish
nothing. Reconnect refetches `myTodayRoute`.

### Route completion vs order delivery

Completing a route means the courier finished the route workflow. It does **not**:

- change `Order` status or mark orders `DELIVERED`;
- decrement stock or create `StockAdjustment`;
- modify `RouteTemplate` or regenerate stops.

Order delivery remains a separate admin action (Phase 10).

### UI

| Surface                 | Behaviour                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/bezorger/today`       | Start / complete with confirmation; completed/cancelled states; history; large mobile buttons                  |
| `/admin/route-planning` | Status, history, start/complete/cancel with confirmation; regeneration blocked for `IN_PROGRESS` / `COMPLETED` |

### Manual runtime test (Phase 14)

1. Generate a persisted route for today.
2. Log in as the assigned BEZORGER → `/bezorger/today` → status `ASSIGNED`.
3. Click **Route starten** → confirm → `IN_PROGRESS`; refresh to confirm persistence.
4. Click **Route voltooien** → confirm → `COMPLETED`; no further action controls.
5. Inspect MongoDB `statusHistory`: initial `ASSIGNED`, then `IN_PROGRESS`, then
   `COMPLETED`.
6. Confirm orders remain `PLANNED` (or prior statuses); stock unchanged; no new
   `StockAdjustment`.
7. Attempt an invalid/terminal transition — safe error or idempotent no-op.
8. Generate another `ASSIGNED` route; as ADMIN cancel with optional reason;
   courier sees `CANCELLED` via refetch/realtime.
9. Confirm `/bezorger/tomorrow` remains computed and unaffected.

## CI

- `.github/workflows/ci-api.yml` — API lint, typecheck, test, build
- `.github/workflows/ci-pwa.yml` — schema generation, type generation, PWA lint, typecheck, build
