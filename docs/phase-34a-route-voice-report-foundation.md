# Phase 34A — Route voice-report foundation

## Scope

Backend foundation for **route-scoped operational voice reports** recorded by
an assigned courier while a delivery route is active:

- Separate `RouteVoiceReport` Mongo entity (metadata only)
- Dedicated private Azure Blob container for audio bytes
- Authenticated multipart upload (`POST …/voice-reports`)
- Role-scoped GraphQL listing (`routeVoiceReports`)
- Authenticated HTTP Range audio streaming
- Audit + redacted PubSub foundations
- Explicit Mongo/Blob compensation (no broken AVAILABLE reports)

Out of scope (later phases):

- Speech-to-text / transcription (Phase 34B+)
- Microphone recording UI (Phase 34C)
- LLM summarisation or categorisation
- Offline recording / offline report caching
- Push notifications containing report content
- Deploy

## Roles

| Action                        | ADMIN | Assigned BEZORGER | Unrelated BEZORGER | APOTHEKER | Anonymous |
| ----------------------------- | ----- | ----------------- | ------------------ | --------- | --------- |
| Create (upload)               | No    | Yes (IN_PROGRESS) | No                 | No        | No        |
| List metadata                 | Yes   | Yes               | No                 | No        | No        |
| Stream / seek audio           | Yes   | Yes               | No                 | No        | No        |
| Delete / edit / replace audio | No    | No                | No                 | No        | No        |

Reports remain readable after route `COMPLETED` or `CANCELLED`. Creation is
allowed only while the route is `IN_PROGRESS`.

## Limits

Centralised in `route-voice-report.constants.ts`:

| Limit                     | Value  |
| ------------------------- | ------ |
| Max reports per route     | 20     |
| Max upload size           | 10 MiB |
| Min duration (declared)   | 1 s    |
| Max duration (declared)   | 180 s  |
| Max selectedLocale length | 16     |
| Max clientUploadId length | 64     |

## Data model

Collection: `route_voice_reports` (not embedded in `DeliveryRoute`).

Persisted metadata includes: `routeId`, `bezorgerProfileId`,
`recordedByUserId`, `sequenceNumber`, `status`, opaque `blobName`,
`containerName`, `mimeType`, optional `codec`, `fileExtension`, `sizeBytes`,
`durationSeconds`, `sha256`, `clientRecordedAt`, `uploadedAt`, optional
`selectedLocale` / `browserFormatLabel`, `clientUploadId`,
`idempotencyFingerprint`, timestamps.

**Not stored:** audio bytes, original filename, Azure URLs, SAS tokens,
credentials, bearer tokens, transcript fields.

### Status lifecycle

| Status          | Visible in listing | Meaning                                     |
| --------------- | ------------------ | ------------------------------------------- |
| `UPLOADING`     | No                 | Reservation before blob + finalisation      |
| `AVAILABLE`     | Yes                | Storage + Mongo metadata complete           |
| `UPLOAD_FAILED` | No                 | Failed upload; idempotent retry may recover |

Phase 34A does **not** introduce transcription statuses.

### Indexes

- Unique `(routeId, sequenceNumber)`
- Unique `(recordedByUserId, routeId, clientUploadId)`
- `(routeId, createdAt)`
- `(bezorgerProfileId)`

## Sequence allocation

Route-scoped `sequenceNumber` starting at 1.

Strategy: **max(existing) + 1** with unique-index retry (up to 8 attempts).
`DeliveryRoute` is **not** mutated. Concurrent uploads must not share a
sequence. Listing sorts by `sequenceNumber` ascending, then `createdAt` / `id`.

## Azure private container

- Logical container: `AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER`
  (default `route-voice-reports`)
- Reuses `AZURE_STORAGE_CONNECTION_STRING` (AccountName + AccountKey)
- Private access only; no public anonymous URLs; no browser SAS upload
- Opaque blob path:
  `route-voice-reports/{routeId}/{reportId}/audio.{ext}`
- Upload uses `ifNoneMatch: '*'` (no overwrite)
- Container is assumed to exist (same pattern as vaccine images); startup does
  not provision production containers

## Accepted audio formats

Validated by magic bytes **and** allow-listed MIME (Content-Type is not trusted
alone):

| Container | Magic / signature                    | Stored MIME  | Extension |
| --------- | ------------------------------------ | ------------ | --------- |
| WebM      | EBML `1A 45 DF A3`                   | `audio/webm` | `webm`    |
| Ogg       | `OggS`                               | `audio/ogg`  | `ogg`     |
| MP4/M4A   | ISO BMFF `ftyp` + allow-listed brand | `audio/mp4`  | `m4a`     |

Declared MIME may include codecs (e.g. `audio/webm;codecs=opus`).

### Duration strategy (Phase 34A)

Client-declared `durationSeconds` is accepted only as **bounded untrusted
metadata** (1–180). Reliable server-side duration extraction (FFmpeg or a heavy
parser) is postponed. Do not treat stored duration as cryptographically
authoritative. SHA-256 of bytes is stored for integrity and idempotency
fingerprinting.

## Multipart contract

```
POST /delivery-routes/:routeId/voice-reports
Authorization: Bearer <Firebase ID token>
Content-Type: multipart/form-data

Parts:
  audio              — binary file (required, field name exact)
  clientRecordedAt   — ISO timestamp
  durationSeconds    — numeric string (1–180)
  clientUploadId     — stable UUID / idempotency key
  selectedLocale     — optional (en-GB, nl-NL, pl-PL, …)
  browserFormatLabel — optional bounded label
```

Success: **HTTP 201** with safe JSON
(`id`, `routeId`, `sequenceNumber`, `status`, `mimeType`, `sizeBytes`,
`durationSeconds`, `clientRecordedAt`, `uploadedAt`, `selectedLocale`,
`canPlayAudio`).

Never returns: `blobName`, `containerName`, Azure URL, `sha256`,
`recordedByUserId`, internal storage metadata.

## Idempotency

Scoped by `recordedByUserId + routeId + clientUploadId`.

- Same key + same fingerprint → return existing AVAILABLE report
- Same key + incompatible payload → `ROUTE_VOICE_REPORT_IDEMPOTENCY_CONFLICT`
- Concurrent identical requests → one successful report
- Fingerprint hashes mime, size, duration, sha256, locale (not raw audio)

Failed (`UPLOAD_FAILED`) or stale `UPLOADING` reservations may be resumed with
the same `clientUploadId` when the fingerprint matches.

## SHA-256 integrity

Computed server-side over uploaded bytes. Stored for:

- incompatible idempotent replay detection
- future corruption checks

Not exposed in normal GraphQL/REST UI output. Not used alone as
user-level deduplication (two intentional reports may share identical audio).

## Mongo / Blob compensation

Exact cross-system atomicity is impossible.

Recommended flow:

1. Authenticate / authorise / validate
2. Reserve report id + sequence (`UPLOADING`) + idempotency state
3. Upload blob under unique non-overwriting name
4. Finalise `AVAILABLE`
5. Audit (once) + redacted PubSub (once)
6. Return 201

| Failure                          | Compensation                                    |
| -------------------------------- | ----------------------------------------------- |
| Blob upload fails                | Mark `UPLOAD_FAILED`; no AVAILABLE row          |
| DB finalisation fails after blob | Delete blob (best effort); mark `UPLOAD_FAILED` |
| Stale `UPLOADING` (>15 min)      | `recoverStaleUploadingReservations` cleanup     |

Success is reported only when both storage and Mongo metadata are complete.

## GraphQL metadata

```graphql
routeVoiceReports(routeId: ID!): [RouteVoiceReport!]!
```

Safe fields: `id`, `routeId`, `sequenceNumber`, `status`, `mimeType`,
`durationSeconds`, `selectedLocale`, `clientRecordedAt`, `uploadedAt`,
`recordedByDisplayName`, `canPlayAudio`.

Subscription foundation:

```graphql
routeVoiceReportUpdates: RouteVoiceReportUpdate!
```

Redacted payload: `routeId`, `reportId`, `status`, `eventType`.
ADMIN (any) or assigned BEZORGER only. No blob names, hashes, tokens, or user IDs.

## Secure Range streaming

```
GET /delivery-routes/:routeId/voice-reports/:reportId/audio
```

| Condition             | Response                              |
| --------------------- | ------------------------------------- |
| Full body             | 200 + `Accept-Ranges: bytes`          |
| Valid single Range    | 206 + `Content-Range`                 |
| Invalid / multi-range | 416 + `Content-Range: bytes */<size>` |

Headers always include `Cache-Control: private, no-store`,
`X-Content-Type-Options: nosniff`, and an inline
`Content-Disposition` filename `route-report-<sequence>.<ext>`.

Streams from Azure (or fake provider) without loading the full 10 MiB into
memory solely to serve a range. Client disconnect aborts the stream when
possible. No redirect to a permanent Blob URL; no query-string auth.

## Audit

Event: `ROUTE_VOICE_REPORT_CREATED` (unique per `reportId`).

Records: routeId, reportId, sequenceNumber, bezorgerProfileId, actor user ID,
durationSeconds, sizeBytes, mimeType, selectedLocale, createdAt.

Does **not** record audio bytes, transcript, blob URL, credentials, bearer
token, or original filename. Idempotent replay does not duplicate audit or
PubSub.

## Offline / cache safeguards

Phase 34A introduces **no** offline creation path.

- Service worker must not runtime-cache voice-report endpoints (already
  NetworkOnly; no `delivery-routes` / `voice-reports` registerRoute)
- IndexedDB route serializers forbid voice-report / blob / sha256 fields
- `ForbiddenPendingActionType.RouteVoiceReportUploaded` documents the ban
- GraphQL remains network-only

## Privacy / retention

Recordings are internal operational reports. Private Azure URLs are never
exposed to the PWA. Future retention/deletion policy is out of scope for 34A;
there is no user-facing delete after successful creation.

## Environment

| Variable                                      | Notes                                     |
| --------------------------------------------- | ----------------------------------------- |
| `AZURE_STORAGE_CONNECTION_STRING`             | Shared with vaccine images                |
| `AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER` | Default `route-voice-reports`             |
| `VACCINE_IMAGE_STORAGE_PROVIDER`              | `fake`/`azure` also selects voice storage |

Secrets remain backend-only. `.env.example` contains placeholders only.

## Local verification

```bash
npm run format:check
npm run lint:api
npm run typecheck:api
npm run test:api
npm run test:api:e2e
npm run test:docker:safety
npm run validate:production-readiness
npm run generate:schema
```

When PWA safety / offline guards change:

```bash
npm run lint:pwa
npm run typecheck:pwa
npm run test:pwa
npm run build:pwa:production
```

Manual smoke (with Azure container provisioned and fake provider off):

1. Start an `IN_PROGRESS` route as assigned courier
2. `POST` multipart WebM with valid metadata → 201
3. Replay same `clientUploadId` → same report id, no second blob
4. `routeVoiceReports` as ADMIN and assigned courier
5. `GET …/audio` full + `Range: bytes=0-10` → 200 / 206
6. Confirm APOTHEKER and unrelated courier receive 403

## Error codes

Stable codes include:
`ROUTE_VOICE_REPORT_ROUTE_NOT_FOUND`,
`ROUTE_VOICE_REPORT_FORBIDDEN`,
`ROUTE_VOICE_REPORT_ROUTE_NOT_IN_PROGRESS`,
`ROUTE_VOICE_REPORT_LIMIT_REACHED`,
`ROUTE_VOICE_REPORT_AUDIO_REQUIRED`,
`ROUTE_VOICE_REPORT_AUDIO_EMPTY`,
`ROUTE_VOICE_REPORT_AUDIO_TOO_LARGE`,
`ROUTE_VOICE_REPORT_AUDIO_TYPE_UNSUPPORTED`,
`ROUTE_VOICE_REPORT_AUDIO_SIGNATURE_INVALID`,
`ROUTE_VOICE_REPORT_DURATION_INVALID`,
`ROUTE_VOICE_REPORT_TIMESTAMP_INVALID`,
`ROUTE_VOICE_REPORT_IDEMPOTENCY_CONFLICT`,
`ROUTE_VOICE_REPORT_NOT_FOUND`,
`ROUTE_VOICE_REPORT_NOT_AVAILABLE`,
`ROUTE_VOICE_REPORT_RANGE_INVALID`,
`ROUTE_VOICE_REPORT_STORAGE_FAILED`,
`ROUTE_VOICE_REPORT_CREATION_FAILED`,
`ROUTE_VOICE_REPORT_STREAM_FAILED`.

Azure SDK messages and stack traces are never forwarded to clients.
