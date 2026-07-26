# Phase 28A — IndexedDB cache model, courier isolation, offline read-only foundation

## Scope

Storage contracts and services only. The route UI does **not** consume the cache
yet (Phase 28B). Offline QR scanning, delivery confirmation, mutation sync, GPS,
and push changes are out of scope.

## Library choice: `idb`

Chosen as the smallest maintained IndexedDB wrapper that provides:

- Typed `DBSchema`
- Versioned upgrades/migrations
- Browser-only `openDB`
- Clean pairing with `fake-indexeddb` in Vitest

Dexie was considered but is larger than needed for Phase 28A’s simple stores.

Database name: `vaccin-delivery-offline` (no user ids, secrets, or env credentials).

## Allowed cached data

**Courier route snapshot (whitelist serializer only):**

- routeId, routeDate, routeStatus, assignedCourierProfileId
- stopId, sequence, pharmacy name
- address street / houseNumber / postalCode / city
- orderIds, orderCount, totalQuantity
- vaccineId, vaccineName, quantity
- delivery flags `qrAvailable` / `qrConsumed`, `deliveredAt`
- fetchedAt / expiresAt / optional serverUpdatedAt

**Notifications (newest 50, read-only copy):**

- notificationId, type, titleKey, bodyKey, interpolationData, actionPath
- createdAt, readAt **snapshot**, cachedAt, expiresAt

**Pending actions (schema foundation only):**

- Allowed type: `COURIER_STOP_ARRIVED`
- Bounded payload `{ routeId, stopId }` — no sync processing in 28A

## Forbidden cached data

Never persist:

- Encoded QR token, nonce, nonceHash, QR SVG / image Blob / path
- Firebase bearer / refresh tokens
- Push endpoint, p256dh, push auth, VAPID private key
- Azure credentials / Blob SAS URLs
- Unrelated user/profile data, admin-only routes, other couriers’ routes

Do not persist arbitrary GraphQL response objects — always run
`serializeCourierRouteSnapshot`.

## Account isolation

Cache is bound to authenticated Mongo **user id** + **bezorger profile id**
(never role alone).

| Event                    | Behaviour                                                                    |
| ------------------------ | ---------------------------------------------------------------------------- |
| Same courier login       | Retain unexpired cache; unlock session                                       |
| Different courier login  | Clear routes, notifications, pending actions, sync state; reset owner        |
| Non-courier login        | Clear all courier-private offline data                                       |
| Logout / session expired | **Lock** session (no UI reads); preserve IndexedDB for same-courier re-login |

## Logout behaviour

Recommended policy (implemented):

1. Lock / hide data on logout (`sessionUnlocked = false`).
2. Clear IndexedDB only when a **different** authenticated courier logs in
   (or a non-courier logs in).
3. 48-hour absolute `expiresAt` remains the safety fallback.
4. Existing logout still clears in-memory Apollo / notification / toast state so
   logged-out UI never displays private data.

## Expiry and cleanup

- Route and notification records expire after **48 hours** (UTC `expiresAt`).
- Cleanup runs: DB init, after owner resolve, before serving cached reads, after
  successful online refresh.
- No high-frequency timer.
- Route business dates remain Europe/Brussels; cache timestamps are UTC.
- Pending-action default TTL is 7 days (unused until Phase 28C).

## Server-wins rule

- Cached snapshots are read-only replicas of a prior online fetch.
- After reconnect, a successful online route query **replaces** the cache.
- Pending actions (Phase 28C) are validated against fresh server state;
  rejected/conflicting actions never overwrite authoritative server data.
- Server cancellation/completion will invalidate unsafe pending actions (28C).

## Notification cache policy

- Current authenticated user only; newest 50 by `createdAt`.
- `readAt` is a snapshot — **no** offline mark-read mutation.
- Cached notifications must **never** trigger toasts.
- No push subscription secrets.

## Pending-action foundation

- Strict enum: only `COURIER_STOP_ARRIVED`.
- Forbidden (runtime + documented): `QR_CONFIRMED`, `ORDER_DELIVERED`,
  `ROUTE_COMPLETED`.
- Queued-action processing remains **Phase 28C**.

## Service-worker boundary

IndexedDB is the explicit private-data cache. Workbox remains NetworkOnly for
navigations; GraphQL, `/api`, QR SVG REST, Firebase Auth, and push subscription
endpoints are not runtime-cached in Cache Storage.

## IndexedDB failure fallback

If IndexedDB is unavailable, quota exceeded, migration fails, or private browsing
blocks storage:

- Continue in **online-only** mode
- Expose bounded diagnostic categories only (no raw exception text)
- Do not retry in a tight loop
- Online app behaviour is unchanged

## Privacy

IndexedDB is **not** application-encrypted at rest. Therefore we cache only
minimum operational data, expire after 48 hours, isolate by user, clear on
another courier login, never display while logged out, and advise device lock
usage. No hardcoded client-side encryption key.

## Online QR confirmation

Unchanged: QR preview and confirmation still require an online API call.
Online-only detection continues to reuse `useOnlineStatus` (no second detector).

## Explicitly out of Phase 28A

- Offline route UI consumption (**done in Phase 28B** — see
  `phase-28b-offline-route-notification-viewing.md`)
- Offline “arrived” local state UX
- Pending-action sync / conflict resolution (28C)
- Offline QR / delivery confirmation
- GPS, reports, unrelated UI redesign
- Deploy / commit
