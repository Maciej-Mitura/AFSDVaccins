# Phase 28C — Offline courier “Arrived at stop” queue and sync

## Scope

Couriers may mark a pharmacy stop as **arrived** while online or while viewing
a valid cached route offline. Arrival is queued in IndexedDB when needed and
synchronised when connectivity returns **while the PWA is open**.

Out of scope (Phase 28D+):

- Offline QR scanning / delivery confirmation
- Marking orders delivered from the offline queue
- Consuming QR tokens / decrementing stock
- GPS coordinates, reports, Background Sync
- Pharmacist push notifications for arrival

## Arrival is not delivery

“Arrived” means the courier has reached the pharmacy stop. It does **not**:

- mark the order delivered
- consume the QR
- decrement stock
- complete the route
- confirm receipt
- trigger delivery-confirmed notifications

Stops may be marked arrived **out of sequence**.

## Delivered-stop compatibility

If `deliveryProof` already exists, the arrival mutation is rejected with
`DELIVERY_ARRIVAL_STOP_ALREADY_DELIVERED`. No synthetic arrival is written after
delivery. The UI treats delivered as beyond arrived.

## Timestamps

| Field             | Meaning                                                     |
| ----------------- | ----------------------------------------------------------- |
| `clientArrivedAt` | UTC instant when the courier pressed Arrived (device clock) |
| `recordedAt`      | Authoritative UTC instant when the server accepted arrival  |

Persisted on generated `DeliveryRoute` stops only (`arrival` embed).
`RouteTemplate` stops remain arrival-free.

Client timestamps are rejected when:

- more than 5 minutes in the future
- earlier than 24 hours before the route business-date start in Europe/Brussels

## Pending cancellation

While a local action is `PENDING` or `FAILED` (not `SYNCING`), the courier may
cancel it. Cancellation removes the IndexedDB action and the pending overlay.
Accepted server arrivals are **immutable** in the PWA (no undo).

## Local overlay (not cache rewrite)

Rendered stop state = authoritative route (SERVER or CACHE) + pending-action
overlay. The cached route snapshot is **not** rewritten as though arrival were
server-confirmed. After successful sync the pending action is removed, the
route is refetched, and the authoritative snapshot is cached.

## Synchronisation / retry

`OfflineActionSyncService`:

1. Runs only for the authenticated matching courier (user id + profile id)
2. Prefers an authoritative route refresh before submitting
3. Processes eligible actions oldest-first, one at a time
4. Claims `SYNCING` atomically; avoids parallel processing of the same action
5. Transient failures → `FAILED` with bounded exponential backoff (max 5 auto retries)
6. Domain conflicts → `CONFLICT` (no automatic retry); server wins
7. Triggered on reconnect / online while the app is open — **not** a polling loop

Fully closed-app background sync is **not guaranteed**. Bearer tokens are never
stored in the service worker or IndexedDB.

## Conflict / server-wins

Examples:

| Server state                             | Local action                                                   |
| ---------------------------------------- | -------------------------------------------------------------- |
| Route cancelled / completed              | `CONFLICT` / discard; refresh route                            |
| Route reassigned                         | `CONFLICT`; account isolation clears foreign actions           |
| Stop already delivered                   | Drop local pending; show delivered state                       |
| Arrival already recorded (same key)      | Success (idempotent 200)                                       |
| Arrival already recorded (different key) | Remove obsolete local action; refresh                          |
| Invalid timestamp                        | `FAILED`/`CONFLICT`; do not silently rewrite `clientArrivedAt` |

## Action expiry

Pending arrival actions expire at the **earlier** of:

- 48 hours after creation
- route no longer active (checked against authoritative server state at sync)

Expired actions become `CONFLICT` / `FAILED` and are not submitted.

## Account isolation

Pending actions obey Phase 28A owner isolation:

- another courier / non-courier login clears prior pending actions
- logout locks them (no sync until unlocked)
- same courier re-login may resume unexpired actions
- sync verifies owner user id + courier profile id before every submission

## API

`POST /delivery-routes/:routeId/stops/:stopId/arrival`

```json
{ "clientArrivedAt": "<ISO>", "idempotencyKey": "<client UUID>" }
```

BEZORGER + assigned courier only. Firebase bearer auth. Strict body validation.
Stable `DELIVERY_ARRIVAL_*` error codes. Reasonable identity throttle.

On first acceptance only: audit `DELIVERY_STOP_ARRIVAL_RECORDED` and redacted
`bezorgerRouteUpdates` PubSub (triggers online refetch). No pharmacist push.

## Idempotency

Scoped to actor + route + stop (and unique audit index on
`courierUserId` + `idempotencyKey`):

- first valid write persists arrival
- same key replay returns the existing arrival (no duplicate audit/PubSub)
- different key after arrival → `DELIVERY_ARRIVAL_ALREADY_RECORDED`
- concurrent writers: CAS ensures one arrival
