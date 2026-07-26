# Phase 30B — Coarse courier location and upcoming-delivery UI

## Scope

PWA UI for **city-based coarse courier location** and derived next-stop
visibility on:

- Admin generated-route planning
- Courier today-route view
- Pharmacist planned-delivery cards

Builds on Phase 30A GraphQL/`locationStatus` / `myPlannedDeliveries` fields.
Does **not** change location/next-stop business rules.

Out of scope (later phases):

- GPS coordinates / maps / continuous tracking
- Manual next-stop selection
- Temperature monitoring / reports
- Deploy

## UI placement

| Role      | Placement                                           | Component                                             |
| --------- | --------------------------------------------------- | ----------------------------------------------------- |
| ADMIN     | Generated route detail, under courier/status header | `FeatureRouteLocationStatusCard` (`viewerRole=ADMIN`) |
| BEZORGER  | `/bezorger/today`, under route status summary       | same card (`viewerRole=BEZORGER`)                     |
| APOTHEKER | Planned-delivery card when `isNextStop`             | same card (`viewerRole=APOTHEKER`)                    |

Reusable presentational component:

`packages/pwa/src/components/feature/routes/FeatureRouteLocationStatusCard.vue`

Inputs are **safe presentation data only** (no raw route entities). Mappers live
in `route-location-status.ts`.

## City-based coarse location (not live GPS)

Displayed city is the snapshot city of the latest authoritative stop event
(`ARRIVAL` or `DELIVERY`). UI copy states explicitly that this is **not** live
GPS tracking (pharmacist block always; shared `routes.location.notLiveGps` key).

No coordinates, maps, event IDs, or courier internal IDs are rendered.

## Source wording

| Source     | UI                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `ARRIVAL`  | “Recorded when the courier arrived at stop {sequence}” (or short “Recorded on arrival”)                  |
| `DELIVERY` | “Recorded when delivery was confirmed at stop {sequence}” (or short “Recorded on delivery confirmation”) |

Pharmacist UI omits source detail; only city + last-updated time.

## Historical versus active

| Route status              | Location card                                           | Next stop                                        |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `ASSIGNED`                | Empty / none yet                                        | Hidden (not active travel)                       |
| `IN_PROGRESS`             | Active city + source + next when known                  | Shown when derivable                             |
| `COMPLETED` / `CANCELLED` | **Historical** wording (“Last recorded route location”) | Hidden — no “currently travelling” / active next |

## Next-stop visibility

- ADMIN / assigned BEZORGER: safe `nextStop` summary (sequence, pharmacy name, city)
- No wraparound; when no later undelivered stop remains → “No later delivery stop remains”
- Pharmacist never sees another pharmacy’s name as “next”

## Pharmacist privacy

- Location block only when `isNextStop === true`, route `IN_PROGRESS`, stop not consumed
- City/time come from Phase 30A server gating (`lastKnownCourierCity` etc.)
- Earlier / later / unrelated / delivered / completed-cancelled → no location UI
- Realtime refresh is **recipient-scoped**: on new `APOTHEKER_NEXT_STOP` /
  `APOTHEKER_DELIVERY_CONFIRMED` / `APOTHEKER_ROUTE_STARTED` notifications, the
  pharmacist re-queries `myPlannedDeliveries` (full authoritative payload).
  No private next-stop broadcast to unrelated pharmacies.

## Offline cached location

Courier IndexedDB snapshots already whitelist safe location fields (Phase 30A).

When `todayRouteSource === 'CACHE'`:

- Card shows cached city/time/next summary
- Existing offline-copy warning remains
- Additional subtle: “This location may be outdated.”
- Pending offline arrival overlays **must not** invent confirmed location
- On reconnect, server refetch replaces cached values (existing
  `loadMyTodayRoute({ isRefresh: true })`)

Admin/pharmacist remain online-only for this phase.

## Realtime / refetch strategy

| Surface    | Strategy                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Courier    | Existing `bezorgerRouteUpdates` → optimistic UI update → **full** `loadMyTodayRoute` refetch (do not treat PubSub as sole cache authority) |
| Admin      | Existing load on mount / date change / generate / status actions                                                                           |
| Pharmacist | Mount + reconnect refetch; notification-received handler triggers planned-delivery refetch                                                 |

Do not display partial PubSub payloads as the only offline snapshot write.

## Accessibility

- Semantic heading for the location section
- Historical / next / outdated states use explicit text (not colour alone)
- `<time>` for recorded timestamps
- `aria-live="polite"` region announces meaningful location updates
- Pharmacist “Your delivery is next” is a real heading, readable to screen readers

## i18n

Keys under `routes.location.*` (EN + NL complete; ES/ZH Default/EN fallback).

Sync:

```bash
npm exec --workspace=@vaccin-delivery/i18n-export -- tsx src/sync-phase30b-keys.ts
npm run export:i18n
```

## Tests

- `FeatureRouteLocationStatusCard.spec.ts` — admin/courier/pharmacist presentation,
  historical, empty, source wording, offline outdated warning, timestamps
- `FeatureApothekerPlannedDeliveries.spec.ts` — next-stop block visibility /
  privacy (no city for non-next stops)
- Existing arrival, QR, planned-delivery, notification, offline suites remain green
