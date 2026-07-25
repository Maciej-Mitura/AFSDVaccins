# Enhancement Domain Model — Planning Proposal

**Status:** Planning only (Phase 21). **Do not implement entities yet.**  
**Companion:** [enhancement-planning.md](./enhancement-planning.md) · [implementation-roadmap.md](./implementation-roadmap.md)

MongoDB modelling preference: embed when data is always loaded with the parent and has no independent query lifecycle; use separate collections when retention, indexing, or high write volume differ.

---

## Proposed entities / value objects

### VaccineMedia

| Field             | Detail                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Attach catalogue imagery to a vaccine for display and AI validation                                                                                                                 |
| **Likely fields** | `id`, `vaccineId`, `blobUrl` / `storageKey`, `contentType`, `byteSize`, `sha256`, `uploadedByUserId`, `uploadedAt`, `isPrimary`, `status` (`PENDING`/`ACTIVE`/`REPLACED`/`DELETED`) |
| **Lifecycle**     | Upload → validate → active → replace/delete (soft)                                                                                                                                  |
| **Ownership**     | ADMIN writes; all authenticated roles may read active media for catalogue                                                                                                           |
| **Retention**     | Keep soft-deleted rows short-term for audit; purge blobs per policy                                                                                                                 |
| **Sensitivity**   | Low (product images); URLs may be signed                                                                                                                                            |
| **Indexes**       | `{ vaccineId: 1, isPrimary: 1 }`, `{ sha256: 1 }`                                                                                                                                   |
| **Storage**       | Separate collection (blob metadata); binary in object storage                                                                                                                       |
| **Phase**         | 25                                                                                                                                                                                  |

### VaccineImageAnalysis

| Field             | Detail                                                                                                                                                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Structured AI classification / OCR / decision for a `VaccineMedia`                                                                                                                                                                                                                                                   |
| **Likely fields** | `id`, `mediaId`, `vaccineId`, `provider`, `model`, `requestedAt`, `completedAt`, `status` (`QUEUED`/`RUNNING`/`SUCCEEDED`/`FAILED`/`OVERRIDDEN`), `labels[]`, `ocrText`, `decision` (`ACCEPT`/`REJECT`/`REVIEW`), `confidence`, `rawResponseHash`, `overrideReason`, `overrideByUserId`, `attemptCount`, `lastError` |
| **Lifecycle**     | Request → retry → succeed/fail → optional human override                                                                                                                                                                                                                                                             |
| **Ownership**     | ADMIN                                                                                                                                                                                                                                                                                                                |
| **Retention**     | Keep final + override audit; trim raw payloads                                                                                                                                                                                                                                                                       |
| **Sensitivity**   | Medium (provider payloads may contain unexpected text)                                                                                                                                                                                                                                                               |
| **Indexes**       | `{ mediaId: 1 }`, `{ status: 1, requestedAt: -1 }`, `{ rawResponseHash: 1 }` for cache                                                                                                                                                                                                                               |
| **Storage**       | Separate collection                                                                                                                                                                                                                                                                                                  |
| **Phase**         | 26                                                                                                                                                                                                                                                                                                                   |

### DeliveryProof (Phase 26A: embedded on generated stop)

| Field               | Detail                                                                                                                                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**         | QR-based proof that a **generated route stop** (and its associated orders) was delivered                                                                                                                                                                                                                       |
| **Phase 26A shape** | Embedded on `DeliveryStop` as `qrConfirmation` (`tokenVersion`, `nonceHash`, `encodedToken`, `issuedAt`, `consumedAt?`, `consumedByUserId?`) + `deliveryProof` (`method: QR`, `deliveredAt`, `deliveredByUserId`, `associatedOrderIds`, `recipientProfileId`, `recipientCity`, optional `confirmationEventId`) |
| **Token**           | HMAC-SHA-256; claims `{ v, routeId, stopId, nonce }` only; at generation mint + persist `encodedToken` with `nonceHash`; never store plaintext nonce                                                                                                                                                           |
| **Lifecycle**       | Generate+mint → SVG retrieval (26B) → preview (26C) → confirm PROCESSING (token verifiable) → deliver orders → COMPLETED (clear `encodedToken`, write `deliveryProof`)                                                                                                                                         |
| **Ownership**       | **Preview (26C):** assigned BEZORGER only while route `IN_PROGRESS`. **Confirm (26D):** assigned BEZORGER (explicit confirm only). **Retrieval (26B):** ADMIN or recipient APOTHEKER (`DeliveryStop.apothekerUserId`) while route `ASSIGNED`/`IN_PROGRESS` and QR unconsumed                                   |
| **Retention**       | Long-lived on the generated route document; focused audit collection `delivery_qr_confirm_audit_events` keyed by `confirmationEventId`                                                                                                                                                                         |
| **Sensitivity**     | High bearer (`encodedToken`); never GraphQL on ordinary route/stop; redact from PubSub/audit/logs; safe fields only (`qrAvailable`, `qrConsumed`, `deliveredAt`, plus `deliveryStopQr` metadata / SVG render path)                                                                                             |
| **Storage**         | **Embedded on `DeliveryRoute.stops[]`** (not on `RouteTemplate`). Rendered QR images are **never** persisted (on-demand SVG only). Confirm audit is a separate append-only collection                                                                                                                          |
| **Legacy**          | Pre-26A routes without QR state remain readable; no startup backfill (policy C); retrieval returns `DELIVERY_QR_NOT_AVAILABLE`                                                                                                                                                                                 |
| **Phase**           | 26A foundation; 26B retrieval/SVG; 26C courier preview; 26D confirm/consume; 26E camera UI; roadmap 27 for manifest export                                                                                                                                                                                     |

### DeliveryManifest

| Field             | Detail                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Exportable snapshot of a route’s stops/orders for a delivery date                                                                           |
| **Likely fields** | `id`, `routeId`, `deliveryDate`, `generatedAt`, `generatedByUserId`, `format` (`CSV`/`PDF`), `storageKey` optional, `checksum`, `lineCount` |
| **Lifecycle**     | Generate on demand → optional store → download                                                                                              |
| **Ownership**     | ADMIN; BEZORGER for own route                                                                                                               |
| **Retention**     | Short (regenerable) or omit persistence and stream only                                                                                     |
| **Sensitivity**   | Medium (pharmacy addresses, order volumes)                                                                                                  |
| **Indexes**       | `{ routeId: 1, generatedAt: -1 }` if persisted                                                                                              |
| **Storage**       | Prefer **ephemeral generation**; persist metadata only if audit required                                                                    |
| **Phase**         | 27                                                                                                                                          |

### CourierLocationSnapshot

| Field             | Detail                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Time-stamped courier position while a route is active                                                                   |
| **Likely fields** | `id`, `bezorgerProfileId`, `routeId`, `lat`, `lng`, `accuracyMeters`, `recordedAt`, `source` (`DEVICE`), `ttlExpiresAt` |
| **Lifecycle**     | Insert while `IN_PROGRESS` → expire/purge by retention job                                                              |
| **Ownership**     | BEZORGER writes own; ADMIN reads all active; APOTHEKER reads **relevant approaching only**                              |
| **Retention**     | Short TTL (e.g. hours after route complete) — privacy                                                                   |
| **Sensitivity**   | **High** (personal location)                                                                                            |
| **Indexes**       | `{ bezorgerProfileId: 1, recordedAt: -1 }`, `{ routeId: 1, recordedAt: -1 }`, `{ ttlExpiresAt: 1 }` TTL index           |
| **Storage**       | Separate collection (high write volume); do **not** embed on User                                                       |
| **Phase**         | 28                                                                                                                      |

### TemperatureReading

| Field             | Detail                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Cold-chain reading for cargo context — **not** phone ambient as vaccine sensor                                                                                             |
| **Likely fields** | `id`, `routeId`, `orderId?`, `vaccineId?`, `celsius`, `recordedAt`, `source` (`SIMULATED` \| `MANUAL` \| `BLE_SENSOR` \| `MQTT_DEVICE`), `deviceId?`, `submittedByUserId?` |
| **Lifecycle**     | Submit → evaluate thresholds → maybe open incident                                                                                                                         |
| **Ownership**     | BEZORGER / system integration; ADMIN read                                                                                                                                  |
| **Retention**     | Medium (demo + incident evidence)                                                                                                                                          |
| **Sensitivity**   | Low–medium; `deviceId` pseudonymous                                                                                                                                        |
| **Indexes**       | `{ routeId: 1, recordedAt: -1 }`, `{ source: 1 }`                                                                                                                          |
| **Storage**       | Separate collection                                                                                                                                                        |
| **Phase**         | 29                                                                                                                                                                         |

### ColdChainIncident

| Field             | Detail                                                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Lifecycle when temperature leaves vaccine-specific thresholds                                                                                                                                                                     |
| **Likely fields** | `id`, `routeId`, `orderIds[]`, `vaccineIds[]`, `severity`, `openedAt`, `closedAt`, `status` (`OPEN`/`ACKNOWLEDGED`/`RESOLVED`), `thresholdMin`, `thresholdMax`, `peakCelsius`, `durationSeconds`, `acknowledgedByUserId`, `notes` |
| **Lifecycle**     | Open → acknowledge → resolve                                                                                                                                                                                                      |
| **Ownership**     | System opens; ADMIN/BEZORGER ack within scope                                                                                                                                                                                     |
| **Retention**     | Long (trust score + audit)                                                                                                                                                                                                        |
| **Sensitivity**   | Medium                                                                                                                                                                                                                            |
| **Indexes**       | `{ status: 1, openedAt: -1 }`, `{ routeId: 1 }`                                                                                                                                                                                   |
| **Storage**       | Separate collection                                                                                                                                                                                                               |
| **Phase**         | 29                                                                                                                                                                                                                                |

**Vaccine threshold fields** (extend existing `Vaccine` or settings): `minStorageCelsius`, `maxStorageCelsius` — Phase 29, not a new collection.

### PushSubscription

| Field             | Detail                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Web Push endpoint registration per device/user                                                          |
| **Likely fields** | `id`, `userId`, `endpoint`, `p256dh`, `auth`, `userAgent`, `createdAt`, `lastSuccessAt`, `failureCount` |
| **Lifecycle**     | Register → use → cleanup on 404/410                                                                     |
| **Ownership**     | Owning user only                                                                                        |
| **Retention**     | Until unsubscribe / invalid                                                                             |
| **Sensitivity**   | **High** (push endpoint)                                                                                |
| **Indexes**       | `{ userId: 1 }`, `{ endpoint: 1 }` unique                                                               |
| **Storage**       | Separate collection                                                                                     |
| **Phase**         | 30                                                                                                      |

### NotificationPreference

| Field             | Detail                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Per-user opt-in categories for push / in-app                                                                                      |
| **Likely fields** | `userId` (PK), `orderUpdates`, `routeUpdates`, `stockAlerts`, `coldChainAlerts`, `marketing` (always false for exam), `updatedAt` |
| **Lifecycle**     | Upsert preferences                                                                                                                |
| **Ownership**     | Own user                                                                                                                          |
| **Retention**     | While account exists                                                                                                              |
| **Sensitivity**   | Low                                                                                                                               |
| **Indexes**       | `{ userId: 1 }` unique                                                                                                            |
| **Storage**       | Separate small collection **or** embed on `User` if always loaded with profile — prefer embed on `User` for simplicity            |
| **Phase**         | 30                                                                                                                                |

### CourierReliabilitySnapshot

| Field             | Detail                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Auditable point-in-time trust/reliability score                                                                                                                         |
| **Likely fields** | `id`, `bezorgerProfileId`, `computedAt`, `score`, `sampleSize`, `components` (onTimeRate, qrSuccessRate, incidentRate, …), `formulaVersion`, `windowStart`, `windowEnd` |
| **Lifecycle**     | Recompute job / on-demand → store snapshot                                                                                                                              |
| **Ownership**     | ADMIN read; system write                                                                                                                                                |
| **Retention**     | Keep historical snapshots for transparency                                                                                                                              |
| **Sensitivity**   | Medium (performance about person)                                                                                                                                       |
| **Indexes**       | `{ bezorgerProfileId: 1, computedAt: -1 }`                                                                                                                              |
| **Storage**       | Separate collection (do not overwrite silently without history)                                                                                                         |
| **Phase**         | 31                                                                                                                                                                      |

### AuditEvent

| Field             | Detail                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| **Purpose**       | Cross-cutting append-only audit for sensitive actions (AI override, QR verify, preference changes) |
| **Likely fields** | `id`, `actorUserId`, `action`, `entityType`, `entityId`, `at`, `metadata` (non-secret), `ipHash?`  |
| **Lifecycle**     | Append only                                                                                        |
| **Ownership**     | System write; ADMIN read                                                                           |
| **Retention**     | Long                                                                                               |
| **Sensitivity**   | Medium                                                                                             |
| **Indexes**       | `{ entityType: 1, entityId: 1, at: -1 }`, `{ actorUserId: 1, at: -1 }`                             |
| **Storage**       | Separate collection                                                                                |
| **Phase**         | 26+ (introduce when first override/QR needs it; generalize in 27–31)                               |

### CacheKey / version metadata (optional)

| Field             | Detail                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Only if distributed cache invalidation needs explicit versions                                                 |
| **Likely fields** | `key`, `version`, `updatedAt`                                                                                  |
| **Lifecycle**     | Bump on write                                                                                                  |
| **Ownership**     | System                                                                                                         |
| **Retention**     | Short                                                                                                          |
| **Sensitivity**   | None                                                                                                           |
| **Indexes**       | `{ key: 1 }` unique                                                                                            |
| **Storage**       | Prefer in-memory / Redis keys **without** Mongo documents unless multi-instance requires shared version tokens |
| **Phase**         | 22 (prefer Redis/memory without Mongo entity)                                                                  |

---

## Embedding vs collection summary

| Prefer embed                         | Prefer separate collection                                          |
| ------------------------------------ | ------------------------------------------------------------------- |
| `NotificationPreference` on `User`   | `CourierLocationSnapshot`, `TemperatureReading` (write-heavy)       |
| Vaccine temp thresholds on `Vaccine` | `DeliveryProof`, `VaccineImageAnalysis`, `ColdChainIncident`        |
| Order line items (already)           | `CourierReliabilitySnapshot`, `AuditEvent`, `VaccineMedia` metadata |

---

## Existing domain touchpoints (no redesign)

Enhancements should **extend**, not replace:

- `Order` / `DeliveryRoute` — QR and temperature link by id
- `Vaccine` / `StockAdjustment` — media + thresholds
- `Notification` — bridge to push
- `User` / profiles — preferences, reliability subject

---

_Document version: 2026-07-23 (Phase 21)._
