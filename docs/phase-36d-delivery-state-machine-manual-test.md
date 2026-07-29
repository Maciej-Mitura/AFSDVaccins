# Phase 36D — Manual three-device delivery state machine test

Use dedicated local/E2E records only. Do not change production data.

## Devices

1. **ADMIN** — desktop or tablet
2. **APOTHEKER** — second browser/profile (keep orders open)
3. **BEZORGER** — phone or third browser (courier PWA)

## Setup

1. ADMIN generates/assigns today’s route with at least one stop that has PLANNED orders and a pharmacy QR.
2. APOTHEKER signs in, opens **My Orders** and **Planned Deliveries**, leaves the tab visible.
3. BEZORGER signs in and opens **Today’s route**.

## Flow

### ADMIN

1. Confirm the route shows stop lifecycle **Planned**.
2. After courier starts: route is **In progress**.
3. After arrival only: stop shows **Arrived** (not delivery confirmed); complete action remains blocked / incomplete badge visible.
4. After QR confirm: stop shows **Delivery confirmed**; completion becomes eligible.
5. After courier completes: route status **Completed**.

### APOTHEKER

1. Keep order/planned-delivery screens open (no hard refresh until the end of the arrival step).
2. When courier marks arrived: orders remain **Planned**; no `APOTHEKER_DELIVERY_CONFIRMED` notification.
3. Show pharmacy QR when courier is ready to scan.
4. After QR confirmation: orders become **DELIVERED** without a full hard refresh (subscription and/or notification refetch).
5. Delivery-confirmed notification appears in the notification centre; action path opens pharmacist orders.
6. Planned Deliveries shows confirmed/consumed QR state.

### BEZORGER

1. Start route (ASSIGNED → IN_PROGRESS).
2. Mark arrival → UI shows **Arrived — not delivered yet** and next-step QR guidance.
3. Attempt **Complete route** → blocked with incomplete stop list.
4. Confirm delivery with pharmacy QR (camera or manual token).
5. Stop shows **Delivery confirmed**; arrival/QR mutation controls disabled.
6. Complete route successfully.
7. Optional: replay the same QR token → rejected safely.

## Pass criteria

- Arrival never marks orders DELIVERED and never sends delivery-confirmed notification.
- Only QR confirmation finalises delivery.
- Route completion is backend-enforced when undelivered deliverable stops remain.
- Pharmacist UI updates without requiring a full hard refresh after confirmation.
