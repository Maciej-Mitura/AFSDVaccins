# Phase 30A — Coarse courier location and upcoming-stop foundation

## Scope

Backend/domain foundation for **city-based coarse courier location** on
generated `DeliveryRoute` documents, plus deterministic next-stop derivation
shared by notifications and role-safe GraphQL output.

Out of scope (Phase 30B+):

- GPS coordinates / maps / continuous tracking
- Manual next-stop selector
- Final pharmacist/courier location UI cards
- Deploy

## City-based coarse location (no GPS)

The courier’s current location is the **city** of the latest generated route
stop where one of these authoritative events occurred:

1. Stop arrival accepted by the server (`source = ARRIVAL`)
2. Stop delivery confirmed by QR (`source = DELIVERY`)

City is always copied from the **generated stop address snapshot**. Clients
never supply a city. No latitude/longitude fields exist.

Before the first accepted arrival or delivery, no current city is available.

`RouteTemplate` is unchanged.

## Persistence

Route-level embed `lastKnownLocation`:

| Field                                              | Notes                                          |
| -------------------------------------------------- | ---------------------------------------------- |
| `stopId` / `stopSequence`                          | Basis stop                                     |
| `city`                                             | Snapshot city only                             |
| `recordedAt`                                       | Arrival `recordedAt` or delivery `deliveredAt` |
| `source`                                           | `ARRIVAL` \| `DELIVERY`                        |
| `recordedByUserId` / `recordedByBezorgerProfileId` | Persistence-only                               |
| `eventId`                                          | Idempotency correlation — persistence-only     |

**Decision:** do **not** persist `nextStopSnapshot`. Next stop is derived from
stops + `lastKnownLocation` (cheap, avoids dual-write drift with
`deliveryProof` / consumed QR).

## Source / timestamp precedence

Deterministic rule (not HTTP arrival order):

1. Exact duplicate `eventId` → no-op (idempotent)
2. Newer `recordedAt` wins
3. Equal `recordedAt` on the **same stop**: `DELIVERY` outranks `ARRIVAL`
4. Older events never replace current state

CAS write matches expected current `eventId` (or absent location) while
`status === IN_PROGRESS`.

## Next-stop sequence rule

Single algorithm: `deriveNextStop` / `selectNextUndeliveredStop`

1. Find basis stop (latest arrived/delivered location stop)
2. Sort by sequence ascending
3. Consider only `sequence > basis.sequence`
4. Skip delivered (`deliveryProof`) and consumed QR stops
5. **No wraparound** to earlier sequences
6. Return first remaining stop, or `null`

**Arrived-but-undelivered later stop remains eligible** as “next” when derived
from an earlier completed stop. Arrival alone does not mark a stop delivered
and does not skip it.

Invalid/duplicate sequences fail safely (`null` / domain error) — never invent
a next pharmacy.

## Route status

| Status        | Location updates      | Next pharmacy        | Visibility                                  |
| ------------- | --------------------- | -------------------- | ------------------------------------------- |
| `ASSIGNED`    | No                    | No                   | No current city                             |
| `IN_PROGRESS` | Yes                   | Yes (when derivable) | Active                                      |
| `COMPLETED`   | No (preserve history) | No                   | ADMIN/courier may view historical city      |
| `CANCELLED`   | No (preserve history) | No                   | Historical for audit; not “active movement” |

Location is **not** erased on completion/cancellation.

## Role visibility

### ADMIN / assigned BEZORGER

GraphQL `locationStatus` (`RouteLocationStatus`):

- `city`, `recordedAt`, `source`, `stopSequence`
- Safe `nextStop` summary (`stopId`, `sequence`, `pharmacyName`, `city`)
- Never `eventId`, Firebase UID, coordinates, unrelated private profiles

Unrelated BEZORGER → `null`.

### APOTHEKER (`myPlannedDeliveries`)

Per own stop only (identity from auth — never client profile id):

- `isNextStop`
- `lastKnownCourierCity` / `lastKnownLocationRecordedAt` / `courierLocationSource`
  only when `isNextStop === true` and route is `IN_PROGRESS`
- Never which other pharmacy is next
- Delivered own stop is not next
- Completed/cancelled → no active pharmacy location

## Arrival integration

After Phase 28C first successful arrival persistence:

- Update `lastKnownLocation` (`source = ARRIVAL`)
- Publish redacted route update **after** location attempt (single PubSub)
- **Does not** trigger `APOTHEKER_NEXT_STOP`
- Does not mark delivered / consume QR

Idempotent arrival replay → no location re-write / no duplicate PubSub.

## Delivery-confirmation integration

After Phase 26D QR finalisation:

- Update/reaffirm location (`source = DELIVERY`, `recordedAt = deliveredAt`)
- Derive next stop via central algorithm
- Reuse that result for `APOTHEKER_NEXT_STOP`
- Notification city prefers `lastKnownLocation.city`

Resume/retry uses stable `confirmationEventId` → idempotent location +
notification event ids.

## Notifications

`APOTHEKER_NEXT_STOP` uses the same derivation as GraphQL/visibility.
Arrival never creates next-stop notifications; delivery confirmation does.

## Reliability policy

Location update is **secondary** to arrival/delivery:

- Core arrival/QR confirmation remains successful if location fails
- Failure is logged with a bounded operational event
- Location can be repaired via `recomputeRouteLocation(routeId)`
  (ADMIN/internal; not automatic on startup; idempotent)
- Recompute selects latest stop arrival/`deliveryProof` timestamps with the
  same precedence rules

## Audit / PubSub

Audit: `DELIVERY_ROUTE_LOCATION_UPDATED` (unique on `eventId`).

PubSub: existing redacted `bezorgerRouteUpdated` only — no duplicate on
idempotent replay; no private next-stop broadcast to unrelated pharmacies.

## Offline cache

Courier route snapshot whitelist extended with:

- `lastKnownCourierCity`
- `lastKnownLocationRecordedAt`
- `locationSource`
- `nextStopSequence` / `nextStopPharmacyName` / `nextStopCity`

Assigned courier only; no coordinates; pending offline arrival overlay does
**not** fake confirmed location before server sync.

## Service entry points

`DeliveryRouteProgressLocationService`:

- `recordArrivalLocation`
- `recordDeliveryLocation`
- `deriveNextStop`
- `getSafeLocationForActor`
- `getPharmacistLocationVisibility`
- `buildSafeLocationStatus`
- `recomputeRouteLocation`
