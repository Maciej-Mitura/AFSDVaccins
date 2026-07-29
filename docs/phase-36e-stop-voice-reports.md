# Phase 36E — Stop-scoped courier voice reports

## Summary

Voice reports move from a single route-level control to **per-stop** delivery
reports. New uploads require `stopId`. Legacy route-level documents (no
`stopId`) remain readable and are never auto-associated with a stop.

## Compatibility model

| Field                | New uploads                             | Legacy rows |
| -------------------- | --------------------------------------- | ----------- |
| `routeId`            | required                                | required    |
| `stopId`             | required                                | null/absent |
| `apothekerProfileId` | denormalised from stop (server-derived) | null        |
| `clientUploadId`     | required (unchanged idempotency)        | present     |

- Do **not** replace `routeId` with `stopId`.
- Do **not** destructively migrate legacy rows.
- No guessed stop association for legacy reports.

## Lifecycle / ownership policy

Recording allowed when:

1. Route status is `IN_PROGRESS`
2. Stop exists on that route
3. Authenticated courier owns the assigned route
4. Before or after arrival; after QR confirmation still allowed while IN_PROGRESS

Recording rejected when route is `COMPLETED` or `CANCELLED`.

Multiple reports per stop are allowed. Retries use `clientUploadId` (no silent replace).

**APOTHEKER:** still denied for list/upload/stream (unchanged). Pharmacist
visibility could be appropriate later for delivery confirmation context, but is
**not** enabled in 36E.

## GraphQL / REST contract

### REST upload (BEZORGER)

`POST /delivery-routes/:routeId/voice-reports`

Multipart fields (additive):

- existing: `audio`, `clientRecordedAt`, `durationSeconds`, `clientUploadId`, …
- **new required:** `stopId`

Missing `stopId` → `ROUTE_VOICE_REPORT_STOP_ID_REQUIRED` (clear validation error;
does **not** create another route-only report).

Pharmacy / order IDs from the client are ignored / not accepted as authoritative.

### GraphQL (additive)

`RouteVoiceReport` adds nullable:

- `stopId`
- `stopSequence`
- `pharmacyDisplayName`
- `isLegacyRouteReport`

`RouteVoiceReportUpdate` adds nullable `stopId`.

Private fields remain excluded: `blobName`, container, SAS, `sha256`,
`apothekerProfileId`, user IDs, etc.

Old PWA without `stopId` on upload fails validation after API deploy — see
deployment order.

## Azure blob organisation

**New path:**

```text
route-voice-reports/{routeId}/stops/{stopId}/{reportId}/audio.{ext}
```

**Legacy path (still readable):**

```text
route-voice-reports/{routeId}/{reportId}/audio.{ext}
```

Metadata on new blobs (safe IDs only): `reportid`, `routeid`, `stopid`,
`sha256prefix`. No pharmacy/person names in path or metadata.

No blob migration. Cleanup / validation accepts both path shapes.

## Transcription

Unchanged Azure Speech flow. Lease/retry remains idempotent. `stopId` is
persisted on the report document and included in redacted PubSub + structured
logs (`reportId`, `routeId`, `stopId`). Never log audio, SAS, tokens, or
transcript content beyond existing policy.

## Courier UI

- Global route-tools recorder removed from the normal workflow.
- Each stop mounts a stop-bound recorder near QR / arrival actions.
- Global microphone mutex: one active recording at a time.
- Legacy reports appear in a separate “Legacy route reports” section.

## ADMIN UI

- Route planning voice list groups by stop + legacy section.
- Stop/pharmacy context on cards; no raw IDs as primary labels.
- Playback/retry via existing authorised mechanisms (no eager blob load).

## Indexes

- Existing: `(routeId, createdAt)`, courier idempotency, transcription lease
- Added: `(routeId, stopId, createdAt)`, `(apothekerProfileId, createdAt)`

## Deployment order (preferred)

1. Deploy **API** (additive schema + required `stopId` on new upload).
2. Verify health / schema; old PWA upload gets clear `STOP_ID_REQUIRED` (no
   silent route-only create).
3. Deploy **PWA** with per-stop upload.
4. Verify stop-level upload + ADMIN grouping.
5. Retain legacy read compatibility indefinitely.

GraphQL changes are additive (nullable fields). REST upload is intentionally
stricter (stopId required) — deploy API before PWA that sends stopId, or accept
that old PWA create fails with a clear error until PWA is updated.

## Manual test flow

1. Start courier route (`IN_PROGRESS`).
2. Open Stop A → record short fixture / fake MediaRecorder → upload.
3. Confirm report only under Stop A (courier + ADMIN).
4. Record second report on Stop A (separate card).
5. Confirm Stop B empty of Stop A reports.
6. Complete route → new recording blocked; existing reports still playable.
7. Confirm a pre-36E legacy report (if present) shows under Legacy only.

## Remaining real-device checks

- Physical microphone + mobile Safari/Chrome MediaRecorder codecs
- Concurrent QR camera + voice mic handoff on device
- ADMIN retry after real Azure Speech failure
