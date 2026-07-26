# Phase 28B — Offline courier route and notification viewing

## Scope

Courier UI consumes valid IndexedDB snapshots when the network/API is
unavailable. Online behaviour remains unchanged. Queued mutations, offline QR
preview/confirmation, delivery completion offline, GPS, reports, and push
changes are **out of scope** (Phase 28C+).

## When a cached route is used

A cached route is rendered only when **all** of the following hold:

1. Authenticated courier identity is fully resolved (`initialized` + Mongo user
   id + bezorger profile id).
2. Offline session is unlocked for that owner.
3. A prior **successful online** `myTodayRoute` fetch wrote a whitelisted
   snapshot for this courier.
4. The snapshot is within the 48-hour TTL.
5. The current request failed because the API is unreachable **or** the browser
   reports offline (so the online fetch is skipped).

The route must have been loaded online first. There is no offline bootstrap of
an unseen route.

## Request failure versus domain-error distinction

| Failure                                                                                                | Cache fallback?                                |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Browser offline (`navigator.onLine === false`)                                                         | Yes — read cache directly                      |
| Apollo/network unreachable (`Failed to fetch`, transport `networkError` without domain GraphQL errors) | Yes                                            |
| GraphQL/domain errors (server answered with `graphQLErrors`)                                           | **No**                                         |
| `UNAUTHENTICATED` / `FORBIDDEN` / HTTP 401/403                                                         | **No** — clear UI, do not expose private cache |
| Successful server response with `myTodayRoute: null`                                                   | **No** — server wins; clear owner route cache  |

Raw IndexedDB / Apollo / browser exception text is never shown. UI uses bounded
categories: `OFFLINE_NO_CACHE`, `OFFLINE_CACHE_EXPIRED`, `NETWORK_UNAVAILABLE`,
`CACHE_UNAVAILABLE`, `AUTH_REQUIRED`, `FORBIDDEN`, `SERVER_ERROR`.

## Route source / state model

Explicit source avoids ambiguous boolean combinations:

- `SERVER` — authoritative online route (`isReadOnly = false`)
- `CACHE` — valid offline snapshot (`isReadOnly = true`, `isStaleSnapshot = true`)
- `NONE` — no route to show

Also exposed: `onlineStatus` (via `useOnlineStatus`), `loading`, `refreshing`,
`cachedAt`, `expiresAt`, `errorCategory`, `refreshError`.

## Server-wins reconnect behaviour

When connectivity returns (browser online event → reconnect handlers):

1. Show a bounded refreshing state (keep the current snapshot visible).
2. Fetch authoritative `myTodayRoute`.
3. Replace cached UI state with the server result.
4. Update IndexedDB (write snapshot, or clear owner routes when server returns
   `null`).
5. Re-enable mutations only after a successful authoritative refresh
   (`source = SERVER`).

Server state wins for cancellation, completion, reassignment, stop order, and
order contents. If refresh fails, the valid cached snapshot stays visible and
read-only, with a non-blocking refresh error and manual retry.

## Disabled offline actions

While `source = CACHE` (and whenever the browser is offline for mutation UX):

- Start route / complete route
- Scan delivery QR / manual QR token entry / mark delivered
- Route status changes
- Notification mark-read / mark-all-read

Reason shown in text: “This action requires an internet connection.”

The QR scanner must not request camera permission in cached/offline mode.
**No actions are queued** in this phase.

## Cached route UI

Shows a non-modal offline-copy banner, last-updated timestamp (locale-formatted),
route date, status snapshot, and whitelisted stops (sequence, pharmacy,
address/postal/city, order ids, vaccine lines, delivery flags, `deliveredAt`).

Status history is omitted from cache (not whitelisted). Do not claim the copy is
current. Do not show a “ready for offline use” badge while online.

## Notification offline behaviour (BEZORGER centre)

- Online success → server list, replace IndexedDB (newest 50), mark-read enabled.
- Network unavailable → valid cached list, newest-first, offline banner, mark-read
  disabled; **never toast from IndexedDB**.
- No / expired cache → offline unavailable state.
- Reconnect → authoritative refetch replaces list and cache without duplicates
  (identity = notification id).

## Account-switch protections

- Cache reads require owner match + unlocked session.
- Logout clears in-memory route/notification UI immediately and locks IndexedDB.
- Different courier login clears private stores before unlock.
- UI does not render cache until auth identity has fully resolved (prevents flash).

## GraphQL subscriptions

Subscriptions are not relied on while offline. While connected, subscription
events update the online UI, then a full route refetch writes a validated
IndexedDB snapshot. Partial subscription payloads are not written directly.

## Explicitly out of Phase 28B

- Offline mutation queue / sync (28C)
- Offline QR preview or confirmation
- Offline delivery completion
- GPS, reports, push changes, unrelated UI redesign
- Deploy / commit
