# Vaccinatie-levering

Digital platform for vaccine ordering and delivery route management. Apothekers
place vaccine orders within daily and weekly limits; administrators manage stock,
orders, and route templates; bezorgers execute delivery routes on mobile-first
screens.

## Current status

**Phase 9 — authoritative stock management and low-stock alerts complete.**
`StockService` is the sole writer of `Vaccine.stockQuantity`. Every change creates an
immutable `StockAdjustment` audit row. ADMIN manages stock on `/admin/stock`; low-stock
warnings persist and publish to ADMIN recipients only when stock crosses below the
configured threshold.

**Next phase:** Phase 10 — admin order management and delivery transition (see `docs/implementation-roadmap.md`).

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

Public registration always creates role **`APOTHEKER`**. Clients cannot supply
`role`, `firebaseUid`, or `email` in `createOwnUser`.

### Profile completion

If a Firebase account exists without a MongoDB `User` (for example a Phase 4
test account), login redirects to `/auth/complete-profile` to call
`createOwnUser`.

### GraphQL operations added

| Operation       | Auth            | Purpose                                      |
| --------------- | --------------- | -------------------------------------------- |
| `createOwnUser` | Firebase Bearer | Create application profile                   |
| `currentUser`   | Firebase Bearer | Load MongoDB user (or `USER_NOT_REGISTERED`) |
| `updateOwnUser` | Firebase Bearer | Update first/last name                       |
| `apothekerArea` | APOTHEKER       | Phase 5 role proof                           |
| `adminArea`     | ADMIN           | Phase 5 role proof                           |
| `bezorgerArea`  | BEZORGER        | Phase 5 role proof                           |

### Development role testing

There is no public role-promotion mutation. For local testing of ADMIN or
BEZORGER:

1. Register or complete a profile (creates APOTHEKER).
2. Open **MongoDB Compass** → database `vaccin-delivery` → collection `users`.
3. Edit the `role` field to `ADMIN` or `BEZORGER`.
4. Log out and back in (or refresh) so `currentUser` reloads.

### Manual runtime test

1. Start MongoDB and `npm run dev`.
2. Log in with an existing Phase 4 Firebase account → expect redirect to
   `/auth/complete-profile`.
3. Submit first and last name → MongoDB user created with matching `firebaseUid`,
   Firebase email, role `APOTHEKER`.
4. Refresh → `currentUser` restores; `/apotheker` works; `/admin` → `/forbidden`.
5. Update profile at `/profile` → persists after refresh.
6. Log out → application user state clears.
7. Register a new account → Firebase + MongoDB records created.

PWA composables:

- `useFirebase` — authentication identity
- `useCurrentUser` — application profile and role

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
Delivery-based deduction is **not** implemented until Phase 10.

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

## Stock management (Phase 9)

### Authoritative balance and audit

| Concept                  | Role                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `Vaccine.stockQuantity`  | Current authoritative balance                                          |
| `StockAdjustment`        | Immutable audit history — never summed to derive balance               |
| `StockService`           | Sole writer of `stockQuantity`                                         |
| `VaccineStockRepository` | Atomic MongoDB `findOneAndUpdate` with conditional guard for decreases |

### StockAdjustment fields

| Field                              | Purpose                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `vaccineId`                        | Which vaccine changed                                                     |
| `type`                             | `RESTOCK`, `MANUAL_DECREASE`, or `MANUAL_CORRECTION`                      |
| `quantityDelta`                    | Signed change applied (non-zero); not used as input for `MANUAL_CORRECTION` |
| `targetQuantity`                   | Input for `MANUAL_CORRECTION` — sets stock to this absolute amount          |
| `quantityBefore` / `quantityAfter` | Server snapshots from successful atomic update                            |
| `reason`                           | Required free-text admin explanation                                      |
| `performedByUserId`                | Derived from `@CurrentUser()`                                             |
| `relatedOrderId`                   | Reserved for Phase 10 delivery decrement (null for manual ops)            |
| `idempotencyKey`                   | Optional; **omitted** for manual adjustments (sparse unique when present) |
| `createdAt`                        | Server timestamp                                                          |

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

## CI

- `.github/workflows/ci-api.yml` — API lint, typecheck, test, build
- `.github/workflows/ci-pwa.yml` — schema generation, type generation, PWA lint, typecheck, build

## Next phase

**Phase 10 — admin order management and delivery transition** (`docs/implementation-roadmap.md`):
order FSM transitions, delivery with idempotent stock decrement, and admin operations feed.
