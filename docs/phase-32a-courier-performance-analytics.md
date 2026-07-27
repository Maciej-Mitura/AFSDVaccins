# Phase 32A — Admin courier-performance analytics foundation

## Scope

Backend foundation for **ADMIN-only**, **all-time** courier performance
analytics:

- Central metric definitions and explainable reliability scoring
- GraphQL query `courierPerformanceAnalytics`
- Authenticated CSV export `GET /analytics/couriers/export.csv`
- Short process-local cache (5 minutes)
- Chart-ready monthly activity and distribution payloads
- Data-quality diagnostics
- Export audit event `COURIER_ANALYTICS_EXPORTED`

Out of scope (later phases):

- Full ECharts admin dashboard UI (Phase 32B — see
  `docs/phase-32b-courier-analytics-dashboard.md`)
- Courier-facing analytics
- Live / realtime analytics subscriptions
- Date-range filters (7/30/90-day or custom)
- Deploy

## Visibility

| Role      | Access                                   |
| --------- | ---------------------------------------- |
| ADMIN     | Full analytics + CSV export              |
| BEZORGER  | Rejected (`COURIER_ANALYTICS_FORBIDDEN`) |
| APOTHEKER | Rejected (`COURIER_ANALYTICS_FORBIDDEN`) |
| Anonymous | Rejected by Firebase auth                |

Courier ranking is visible only to ADMIN. No Firebase UID, email, QR tokens,
nonce hashes, Azure config, or notification subscription data is exposed.

## All-time scope

Analytics use the full historical `delivery_routes` collection.

There are **no** date filters. Metrics answer long-term questions such as who
is most reliable overall, who completes assigned work, who delivers on the
planned date, and who consistently uses QR proof.

Metrics refresh when:

- the GraphQL page/query is loaded
- the client passes `refresh: true` (cache bypass)
- the page is revisited after cache TTL expiry

No realtime push of analytics updates.

## Metric definitions

Canonical source:
`packages/api/src/analytics/courier/courier-analytics.definitions.ts`

Resolvers and controllers must not re-derive formulas.

### Courier population

Include couriers with **at least one historically assigned generated route**.

Current BEZORGER profiles with zero routes appear only as
`summary.currentBezorgerProfilesWithZeroRoutes` — they are not ranked above
active couriers.

Safe identity fields: `courierProfileId`, `courierUserId`, `displayName`,
optional `vehicleLabel`.

### Route metrics

| Metric              | Definition                                                                |
| ------------------- | ------------------------------------------------------------------------- |
| totalAssignedRoutes | Generated routes assigned to the courier                                  |
| completedRoutes     | `status = COMPLETED`                                                      |
| cancelledRoutes     | `status = CANCELLED`                                                      |
| activeRoutes        | `ASSIGNED` or `IN_PROGRESS`                                               |
| incompleteRoutes    | `deliveryDate < today` (app timezone) and status ∉ {COMPLETED, CANCELLED} |
| routeCompletionRate | `completed / (completed + incomplete)`; `null` if denominator 0           |

Cancelled and future/non-overdue active routes are excluded from the
completion denominator.

### Delivery metrics

Delivery unit = generated **stop** (not order).

| Metric                        | Definition                                                     |
| ----------------------------- | -------------------------------------------------------------- |
| deliveredStops                | Stops with `deliveryProof` on non-cancelled routes             |
| undeliveredOverdueStops       | Overdue non-cancelled stops without proof                      |
| deliveryCompletionRate        | `delivered / (delivered + undeliveredOverdue)`; `null` if none |
| totalOrdersDelivered          | Sum of associated order counts on delivered stops              |
| totalVaccineQuantityDelivered | Sum of `totalQuantity` on delivered stops                      |

One multi-order stop counts as **one** stop delivery.

### On-time rule (Europe/Brussels)

**Interpretation:** exact same calendar-date equality.

A delivered stop is on time iff
`getLocalCalendarDate(deliveryProof.deliveredAt, timezone) === route.deliveryDate`.

- Same date → on time
- Any other valid date (earlier or later) → late
- Missing/invalid `deliveredAt` → unknown (excluded from on-time denominator;
  counted in diagnostics)

Do not use minute-level ETA, route start time, or server-local dates.

### QR confirmation rate

`qrConfirmedStops` where `deliveryProof.method === 'QR'`.

Denominator: delivered stops with a recognised method (`QR` or `ADMIN`).

Do not infer QR usage from `order.deliveryMethod` alone.

### Operational consistency (0–100)

```
consistencyScore =
  100 × (1 − attributableIssueCount / max(1, eligibleOperationalUnits))
```

Clamped to `[0, 100]`.

- `eligibleOperationalUnits` = `deliveredStops + undeliveredOverdueStops`
- Issues (deduplicated by route/stop key):
  - `OVERDUE_INCOMPLETE_ROUTE`
  - `ABANDONED_PROCESSING_CONFIRMATION`
  - `INVALID_OR_INCOMPLETE_PROOF`

Not penalised: ADMIN-cancelled routes, cancelled orders, push/Azure/offline
failures, reassignment.

## Reliability score

Range 0–100.

| Component               | Weight |
| ----------------------- | ------ |
| Route completion        | 35%    |
| Delivery completion     | 25%    |
| On-time delivery        | 20%    |
| QR confirmation         | 10%    |
| Operational consistency | 10%    |

Each component is calculated independently, clamped 0–100, and exposed with
weighted contributions. Rounding is presentation-only (2 decimals).

### No-data policy

- Rate = `null` when denominator is 0
- Component score = `0` when rate is null (never invent a perfect score)
- `dataCompleteness`: `ELIGIBLE` vs `INSUFFICIENT`
- Insufficient couriers rank **after** eligible couriers

## Ranking tie-breakers

1. Eligible before insufficient
2. `totalScore` descending
3. `deliveredStops` descending
4. `completedRoutes` descending
5. `displayName` ascending
6. `courierProfileId` ascending

## GraphQL output

Query: `courierPerformanceAnalytics(refresh: Boolean = false)`

Returns:

- `generatedAt`
- `summary` (global weighted aggregate rates — not averages of percentages)
- `courierRankings[]`
- `monthlyActivity[]` (YYYY-MM, activity months only — no zero-filled gaps)
- `routeStatusDistribution[]` (`ASSIGNED`, `IN_PROGRESS`, `COMPLETED`,
  `CANCELLED`, `OVERDUE_INCOMPLETE`)
- `deliveryTimelinessDistribution[]` (`ON_TIME`, `LATE`, `UNKNOWN`)
- `deliveryProofDistribution[]` (`QR`, `ADMIN`, `UNKNOWN`)
- `dataQuality`

Monthly buckets use `route.deliveryDate` month boundaries in the application
timezone (default Europe/Brussels).

## Caching

- Key: `analytics:courier-performance:all-time`
- TTL: 5 minutes (process-local `ApplicationCacheService`)
- `refresh: true` invalidates then recalculates
- Failures degrade to loader (never cache thrown errors)

## CSV export

`GET /analytics/couriers/export.csv`

- Firebase bearer + ADMIN only
- Same calculation as GraphQL
- UTF-8 with BOM, RFC4180 escaping
- Formula injection neutralized for cells starting with `=`, `+`, `-`, `@`
- Headers: `Content-Type: text/csv; charset=utf-8`,
  `Content-Disposition: attachment; filename="courier-performance-all-time.csv"`,
  `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`
- No temporary file persistence

Audit on successful export only:

- type `COURIER_ANALYTICS_EXPORTED`
- actor user id, `generatedAt`, row count, scope `ALL_TIME`, format `CSV`

## Indexes

Added compound index on `delivery_routes`: `{ status: 1, deliveryDate: 1 }`.

Existing indexes on `bezorgerProfileId`, `deliveryDate`, and `status` remain.

No multikey index on embedded `stops.deliveryProof.deliveredAt` (costly for
little gain given in-memory stop inspection after route load).

## Aggregation architecture

1. `CourierAnalyticsRepository` — bounded load of routes + bezorger identities
2. `calculateCourierPerformanceAnalytics` — pure TypeScript formulas / ranking
3. `CourierAnalyticsService` — ADMIN auth, cache, response assembly, CSV export

Mongo aggregation pipelines are intentionally not required for Phase 32A;
correctness and unit-testability take priority.

## Legacy compatibility

Historical routes may lack arrival, deliveryProof, deliveredAt, statusHistory,
or newer QR fields. Analytics never invent values; missing data appears in
`dataQuality`; a single legacy stop does not exclude the whole courier.

## Error codes

- `COURIER_ANALYTICS_FORBIDDEN`
- `COURIER_ANALYTICS_GENERATION_FAILED`
- `COURIER_ANALYTICS_EXPORT_FAILED`
- `COURIER_ANALYTICS_TOO_LARGE`

Data-quality issues produce diagnostics, not hard failures.
