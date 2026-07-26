# Phase 27B — PWA notification permission, subscription, toast & centre

## Scope

Client experience on top of Phase 27A foundation:

- Post-login enable banner (no automatic browser permission prompt)
- Profile settings toggle for all roles
- Shared notification centre (ADMIN / APOTHEKER / **BEZORGER**)
- Realtime in-app toast with session dedupe
- VAPID public key via `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` (+ GraphQL fallback)
- Multi-account endpoint exclusivity on register

**Out of scope:** business producers, route reminders (27C), geolocation, offline
sync, deploy, commit.

## Toast versus OS push (division of responsibility)

| App state                         | Delivery                                                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visible / focused window client   | GraphQL `notificationReceived` → **one** top-right Nuxt UI toast. Service worker **suppresses** OS `showNotification` (may `postMessage` `PUSH_SUPPRESSED_FOREGROUND`).      |
| Background / closed installed PWA | Service worker **shows** OS notification when subscribed.                                                                                                                    |
| Later open / history refetch      | Persisted row appears in Notifications tab. **No** toast solely because history was refetched (`markNotificationsSeenForToast` + subscription boundary + id/eventId dedupe). |

## Permission state machine (`usePushNotifications`)

`unsupported` → `unavailable` → `prompt` → `requesting` → `enabled` |
`denied` | `disabled` | `error`

- Permission is requested **only** from an explicit user gesture.
- **Enabled** requires: browser `granted` + PushSubscription + successful backend
  `registerPushSubscription`. Permission alone is not enough.
- Disable: backend `disablePushSubscription` then browser `unsubscribe`.
  Notification history is never deleted.

## Post-login banner

Show when authenticated, push supported, permission `default`, no active device
subscription, and dismissal window expired.

- **Enable** → real `Notification.requestPermission()` then subscribe/register.
- **Not now** → dismiss without permission request.
- Re-prompt: **7 days** (`vaccin.pushPermissionBanner.dismissedAt` in
  localStorage), or immediately via settings enable (dismissal cleared on
  successful enable).

## Multi-account endpoint policy

Backend: registering an endpoint **claims exclusivity** — other users’ active
rows with the same `endpointHash` are disabled. One browser endpoint is not
actively registered to two users simultaneously.

Logout stops GraphQL notification subscription and clears in-memory toast
dedupe; it does **not** auto-unsubscribe the device. The next account must
explicitly enable to re-associate the endpoint.

## VAPID public key (PWA)

- Env: `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` (public only; never private).
- Optional gate: `VITE_WEB_PUSH_ENABLED=true` requires the public key in
  production builds.
- Fallback: `myPushCapability.vapidPublicKey` when env unset.
- Convert with `urlBase64ToUint8Array` before `PushManager.subscribe`.

Local setup: generate keys with `npx web-push generate-vapid-keys`, put the
**public** key in PWA `.env` / `.env.production.local` and the matching pair on
the API. Do not commit real keys.

## i18n

UI keys under `notifications.push.*` and `notifications.centre.*` (EN+NL
complete; ES/ZH use EN Default). Sync:

```bash
npm exec --workspace=@vaccin-delivery/i18n-export -- tsx src/sync-phase27b-keys.ts
npm run export:i18n
```

## Accessibility

Banner and toggle are keyboard-accessible; status uses `aria-live` / text (not
colour alone); notification list uses semantic `ul` / `article`; unread badges
include screen-reader text.
