# Phase 35C — Courier analytics demo data

Controlled, repeatable demo data for the ADMIN courier-performance analytics
dashboard. These accounts are **not** part of the main presentation workflow.

## What it creates

- **10** database-only BEZORGER users / profiles: `Courier Stat 01` … `10`
- Emails: `courier-stat-01@demo.be` … `courier-stat-10@demo.be`
- Synthetic Firebase UIDs (`demo-analytics-stat-NN`) — **no Firebase Auth users**
- One **inactive** route template per courier (avoids active-owner uniqueness conflicts)
- Historical `delivery_routes` + embedded stops across ~**90 days**
- Matching `orders` referenced by stop `orderIds` (for archive consistency)

Presentation accounts (`bezorger1@demo.be`, `bezorger2@demo.be`, pharmacists,
docent, personal admin) are never created or deleted by this script.

## Safety

- Default mode is **dry-run** (no writes).
- `--apply` / `--cleanup` require an explicit flag.
- If `NODE_ENV=production` or `DB_NAME` looks production-like (`prod`,
  `production`, `live`), mutation requires:

```bash
CONFIRM_ANALYTICS_DEMO_DATA=SEED_ANALYTICS_DEMO_DATA
```

- The script never prints DB URIs, passwords, tokens, or service-account JSON.

## Commands

Prefer **direct ts-node** (npm flag forwarding is unreliable on some setups).

From `packages/api` (important — not the monorepo root):

```bash
cd packages/api
npx ts-node --transpile-only scripts/seed-courier-analytics-demo.ts
npx ts-node --transpile-only scripts/seed-courier-analytics-demo.ts --dry-run
npx ts-node --transpile-only scripts/seed-courier-analytics-demo.ts --apply
npx ts-node --transpile-only scripts/seed-courier-analytics-demo.ts --cleanup
```

From the monorepo root:

```bash
npx ts-node --transpile-only packages/api/scripts/seed-courier-analytics-demo.ts --dry-run
```

Or via npm:

```bash
npm run seed:courier-analytics-demo -- --dry-run
npm run seed:courier-analytics-demo -- --apply
npm run seed:courier-analytics-demo -- --cleanup
```

From the monorepo root:

```bash
npm run seed:courier-analytics-demo --workspace=@vaccin-delivery/api -- --dry-run
npm run seed:courier-analytics-demo --workspace=@vaccin-delivery/api -- --apply
```

## Expected counts (approximate)

Depends on the client clock; for a typical run:

| Entity                      |                                                Count |
| --------------------------- | ---------------------------------------------------: |
| Couriers (users + profiles) |                                                   10 |
| Inactive templates          |                                                   10 |
| Routes                      | ~160 (≈120 completed, ≈25 cancelled, ≈15 incomplete) |
| Stops                       |                                                 ~400 |
| Orders                      |                                                 ~400 |

Personas intentionally spread scores (elite → incomplete/cancelled-heavy) so
leaderboard and charts show clear differences.

## Idempotency & cleanup markers

- Deterministic ObjectIds under prefix `a35c00…`
- Email / displayName / template name patterns
- Re-running `--apply` upserts the same ids
- `--cleanup` deletes only matching demo records

## Warnings

- Do **not** run `--apply` against production without the confirmation phrase.
- Do **not** use these accounts for the live presentation walkthrough.
- After apply, open ADMIN → Courier analytics and refresh to see rankings/charts.
