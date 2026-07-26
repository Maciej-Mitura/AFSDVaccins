# Phase 27A — Notification domain foundation, Web Push, delivery policy

## Persisted notification is source of truth

Every user-visible notification is a Mongo `notifications` document.
Realtime PubSub and OS push are delivery channels derived from that row.
Idempotency key: `(recipientUserId, eventId)` via a **partial unique Mongo index**
(`eventId` must be a string). TypeORM sparse unique compound indexes are not used —
they still index explicit `null` and break startup against legacy rows.

Legacy order/stock emitters still write Dutch `title`/`body`. Phase 27A
typed types persist `titleKey`/`bodyKey` + bounded `interpolationData` and
mirror keys into `title`/`body` so the existing Notifications tab keeps working
until a later phase resolves i18n client-side.

## Selected push provider: standard Web Push (VAPID)

Rationale:

- Firebase Admin is Auth-only today (no FCM wiring).
- PWA already uses vite-plugin-pwa; Web Push + PushManager fits installed PWAs.
- Avoids coupling notification delivery to Firebase Messaging SDK.

Config: `PUSH_PROVIDER=webpush|fake`, `WEB_PUSH_VAPID_*`, `WEB_PUSH_SUBJECT`.
Production rejects `fake`. Secrets are backend-only; public VAPID key may be
returned via `myPushCapability`.

## Toast versus push policy / foreground duplicate suppression

1. Create persists + publishes GraphQL `notificationReceived` (recipient filter).
2. Visible app shows **one** in-app toast from that realtime event.
3. OS push may still be requested via `NotificationDeliveryPolicyService` when
   the user has active subscriptions.
4. Service worker checks `clients.matchAll({ type: 'window' })`; if any client
   is visible/focused, **suppress** `showNotification` and optionally postMessage.
5. Background/closed app displays the OS notification.

Result: ordinary events do not show toast + OS push together.

## Permission UX

- Browser `Notification.requestPermission()` runs only after explicit user click
  (`requestNotificationPermissionFromUserGesture`).
- After login, `shouldShowPostLoginPushBanner` encourages enable (foundation;
  full banner UI is a later phase).
- Settings toggle wiring is a later phase; subscription API already supports
  register/disable.

## Multi-device subscriptions

Users may register multiple endpoints. Uniqueness is `(userId, endpointHash)`.
Permanent push failures (404/410/…) disable that subscription; transient failures
increment `failureCount` without immediate removal.

## Reminder policy (foundation only)

Cron: `0 8 * * *` with `timeZone: Europe/Brussels`.
Event id helper: `buildRouteDateReminderEventId`.
Same-day assignment after 08:00 skip helper: `shouldSkipSameDayRouteDateReminder`.
**Route reminder generation is not wired in Phase 27A** (Phase 27C).

## i18n

Title/body keys for the six Phase 27A types (plus permission-banner helpers)
were added to `packages/pwa/src/locales/{nl,en,zh,es}.json`.
EN + NL are complete; ES/ZH currently mirror EN (Default fallback).
Google Sheet `sync:i18n:keys` should be run locally when Sheet credentials are
available.

## Explicitly out of Phase 27A

- Business event producers (route started / next stop / assignment / admin order)
- Full Notifications-tab i18n UI + BEZORGER tab
- Route-next-city notifications
- GPS / geolocation
- Offline sync
- Deploy / commit

## GraphQL surface (authenticated actor only)

- `myNotifications` / `myUnreadNotificationCount` / `markNotificationRead` /
  `markAllNotificationsRead` / `notificationReceived` — now includes BEZORGER
- `myPushCapability` / `registerPushSubscription` / `disablePushSubscription`
  — never returns raw endpoint/p256dh/auth
