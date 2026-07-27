# Phase 32B — ADMIN courier-performance analytics dashboard

## Scope

Professional **ADMIN-only** all-time courier performance dashboard in the PWA,
backed by Phase 32A GraphQL + CSV contracts.

In scope:

- Route `/admin/analytics/couriers` with admin navigation item **Courier analytics**
- Typed composable `useCourierPerformanceAnalytics()`
- Apache ECharts visualisations via a reusable `CommonEcharts` wrapper
- KPI strip, leaderboard, score/component/activity/distribution/handling charts
- Courier detail panel, audit detail table, data-quality panel
- Authenticated CSV export
- EN/NL i18n (ES/ZH Default/EN fallback)

Out of scope:

- Changing Phase 32A metric definitions, weights, ranking, or all-time scope
- Date filters
- Courier-facing ranking
- Realtime subscriptions / polling
- Deploy / commit
- Phase 32C

## Why ECharts

Apache ECharts was chosen because:

- Tree-shakeable modular imports fit the Vite/PWA bundle
- Strong horizontal-bar, grouped-bar, line/area, and donut support for the
  analytical questions in this phase
- Explicit dispose/resize lifecycle for SPA navigation
- Canvas renderer avoids SSR initialisation (PWA is client-only for charts)

Integration is centralised in:

- `packages/pwa/src/components/feature/admin/analytics/echarts-setup.ts`
- `packages/pwa/src/components/feature/admin/analytics/CommonEcharts.vue`
- `packages/pwa/src/components/feature/admin/analytics/courier-chart-options.ts`

Views must not call `echarts.init` directly.

## Dashboard hierarchy

Reading order answers these questions:

1. **Overall operational performance?** — KPI strip (≤6 cards)
2. **Who are the best couriers?** — Official leaderboard
3. **Why do they rank that way?** — Score comparison + component matrix
4. **How has activity evolved?** — Monthly line/area chart + accessible table
5. **Where are completion/proof/timeliness patterns?** — Three donut charts
6. **What exact values support the charts?** — Detail table + CSV export

Optional supporting panels:

- Collapsible **Data quality** diagnostics
- Courier **detail** card (selection from leaderboard/charts)

## KPI selection

Shown:

- Couriers with eligible data
- Completed routes
- Delivered stops
- Overall on-time rate
- Overall QR confirmation rate
- Average reliability score

Not every Phase 32A summary field is a card. Null rates render as `—` with an
insufficient-data label — never as a misleading 0% / 100%.

## Leaderboard

- Backend rank order is authoritative
- Top three receive subtle background emphasis (not gold/silver/bronze medals)
- Insufficient-data couriers are labelled in text
- Row selection opens the detail panel

## Charts

| Chart                               | Question answered                 | Notes                                                                                           |
| ----------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| Score comparison (horizontal bars)  | Highest overall reliability?      | Eligible only; 0–100 axis; insufficient excluded with note                                      |
| Component comparison (grouped bars) | Which components drive rank gaps? | Five components; tooltip shows weighted contribution                                            |
| Monthly activity (line/area)        | Lifetime activity trend?          | Delivered stops, completed routes, delivered orders; quantity omitted to avoid scale distortion |
| Route status donut                  | Status mix?                       | Count + %; centre total                                                                         |
| Timeliness donut                    | On-time / late / unknown?         | Same pattern                                                                                    |
| Proof method donut                  | QR / admin / unknown?             | Same pattern                                                                                    |
| Handling duration bars              | Arrival→delivery dwell?           | Samples only; operational context, **not** in reliability score                                 |

Every chart has title, subtitle/caption, tooltip, empty state, and an accessible
table/text fallback where chart-only would hide information (monthly + detail
table + leaderboard).

## No realtime polling

- Initial load: GraphQL `courierPerformanceAnalytics(refresh: false)`
- Refresh button: `refresh: true` (cache bypass), in-page only
- No automatic polling, websocket, or subscription for analytics

## All-time scope

UI copy states all-time historical scope. No date-range controls are present.

## CSV export

`GET /analytics/couriers/export.csv` via authenticated REST:

- Firebase bearer token
- One 401 retry with forced token refresh
- Validates `text/csv`
- Temporary Blob URL download + immediate revoke
- Filename from safe `Content-Disposition`, else `courier-performance-all-time.csv`
- Not persisted in IndexedDB / service-worker cache

## No-data and legacy handling

- Empty historical work: informative empty/no-data messaging; no fake perfect
  charts
- Partial legacy data: compact collapsible data-quality panel with bounded
  counts only (no raw Mongo IDs)

## Accessibility

- One page `h1`, section headings
- Table captions / headers; chart `role="img"` + title
- Colour is not the sole rank indicator (numeric rank always shown)
- Detail card keyboard-accessible with clear close control
- Loading buttons expose loading labels; live regions for calculated time /
  export feedback
- `prefers-reduced-motion` disables chart animation when practical

## Responsive behaviour

- Desktop: multi-card KPI grid + chart cards
- Tablet: two-column distribution grid
- Mobile: single column; tables scroll horizontally; sticky rank/courier columns
  where practical; charts resize via `ResizeObserver` in `CommonEcharts`

## Visual restraint

- Teal brand semantic palette reused across charts
- No rainbow gauges, 3D, or decorative-only visuals
- Tooltips readable on the light Nuxt UI theme used by the PWA

## Key files

| Area       | Path                                                             |
| ---------- | ---------------------------------------------------------------- |
| View       | `packages/pwa/src/views/admin/ViewAdminCourierAnalytics.vue`     |
| Composable | `packages/pwa/src/composables/useCourierPerformanceAnalytics.ts` |
| Mappers    | `packages/pwa/src/composables/courier-analytics-mappers.ts`      |
| GraphQL    | `packages/pwa/src/assets/graphql/courier-analytics.ts`           |
| CSV REST   | `packages/pwa/src/api/courier-analytics-rest.ts`                 |
| i18n keys  | `packages/i18n-export/src/phase32b-keys.ts`                      |

## Security note

Frontend route meta restricts the page to ADMIN. Backend GraphQL/CSV guards
remain the authoritative boundary.
