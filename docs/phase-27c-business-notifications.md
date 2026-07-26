# Phase 27C — Business notification producers & route-date reminders

## Six wired events

| Type                           | Trigger (after authoritative persist)     | Recipients                                        |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------- |
| `ADMIN_NEW_ORDER`              | Order successfully saved                  | All ADMIN users                                   |
| `BEZORGER_ROUTE_ASSIGNED`      | Route generated/assigned saved            | Assigned courier user                             |
| `APOTHEKER_ROUTE_STARTED`      | Route status CAS `ASSIGNED → IN_PROGRESS` | Each undelivered stop’s apotheker                 |
| `APOTHEKER_NEXT_STOP`          | QR confirmation fully finalised           | Next higher-sequence undelivered stop’s apotheker |
| `APOTHEKER_DELIVERY_CONFIRMED` | QR confirmation fully finalised           | Delivered stop’s apotheker                        |
| `BEZORGER_ROUTE_DATE_REMINDER` | Cron `0 8 * * *` `Europe/Brussels`        | Assigned courier for today’s routes               |

Central producer: `BusinessNotificationProducerService`.
Call sites never scatter raw title/body keys.

## eventId / idempotency

Uniqueness remains `(recipientUserId, eventId)` (partial unique index).

| Type                | eventId pattern                                                |
| ------------------- | -------------------------------------------------------------- |
| Admin new order     | `admin-new-order:{orderId}` (same id, different recipients)    |
| Route assigned      | `bezorger-route-assigned:{routeId}:{courierUserId}`            |
| Route started       | `apotheker-route-started:{routeId}:{stopId}`                   |
| Next stop           | `apotheker-next-stop:{routeId}:{completedStopId}:{nextStopId}` |
| Delivery confirmed  | `apotheker-delivery-confirmed:{confirmationEventId}`           |
| Route-date reminder | `bezorger-route-date-reminder:{userId}:{routeId}:{routeDate}`  |

Push is requested **only** when `createTypedNotification` returns `created: true`.
Idempotent retries do not resend OS push.

## Next-stop sequence rule

After a stop is confirmed:

1. Sort route stops by `sequence` ascending.
2. Select the first stop with **higher** sequence that is undelivered
   (no `deliveryProof` / QR not consumed).
3. Do **not** wrap to an earlier sequence.
4. If the nominal next sequence is already delivered (out-of-order), skip forward.
5. If no later undelivered stop exists, send **no** next-stop notification.

## City as coarse location (no GPS)

`APOTHEKER_NEXT_STOP` interpolation `city` is the **completed** stop’s persisted
`address.city` snapshot (“last recorded in {city}”). No GPS coordinates are
stored or sent.

## 08:00 Europe/Brussels reminder

- Cron timezone: `Europe/Brussels` (civil 08:00 on both sides of DST).
- Eligible: routes whose `deliveryDate` is the current Brussels calendar date,
  status `ASSIGNED` or `IN_PROGRESS`, with a courier profile.
- **Skip** same-day routes whose `generatedAt` is at/after 08:00 Brussels
  (`shouldSkipSameDayRouteDateReminder`).
- Prior-day assignment for today’s route date is included.
- Completed / cancelled / unassigned routes are skipped.
- Restart and multi-replica safety: deterministic `eventId` + unique index.

## Push failure policy

1. Persist notification + GraphQL realtime (create path).
2. Invoke `NotificationDeliveryPolicyService.requestPushDelivery`.
3. Transient push failure → bounded delivery state; subscription kept.
4. Permanent failure → disable/remove subscription per Phase 27A policy.
5. **Push failure never rolls back** order create, route assign/start, or QR
   confirmation. Producer catches and logs bounded errors (no endpoints/tokens).
6. If notification **persistence** itself fails, the domain action still succeeds;
   failure is logged as `business_notification_producer_failed`.

## Foreground toast / background push

Unchanged from 27A/27B: realtime toast when app visible; SW suppresses OS push
when a window client is focused; background shows OS notification when subscribed.

## Reassignment / regeneration

- Regenerating a route for the **same** courier + route id does not duplicate
  `BEZORGER_ROUTE_ASSIGNED` (stable eventId).
- Assigning a **different** courier uses a different route document / courier id
  → new notification to the new courier.
- **No revocation** notification is sent to a previously assigned courier
  (explicitly out of scope).

## Action paths (internal only)

Validated via `sanitizeInternalActionPath`:

- Admin → `/admin/orders`
- Courier → `/bezorger/today`
- Pharmacist → `/apotheker/orders`

## Explicitly out of Phase 27C

- GPS tracking
- Offline notification queues
- Unrelated UI redesign
- Deploy / commit
- Phase 27D
