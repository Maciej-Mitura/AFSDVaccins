# Phase 34B — Azure Speech transcription for route voice reports

## Scope

Automatic machine transcription of successfully uploaded route voice reports
(Phase 34A). No microphone UI, no LLM summarisation/classification/sentiment,
no transcript editing, no offline IndexedDB caching, no push notifications.

## Azure Speech API choice

| Item             | Value                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| Product          | Azure AI Speech (Speech / Cognitive Services resource)                  |
| API              | **Fast transcription** (synchronous)                                    |
| Endpoint path    | `POST {endpoint}/speechtotext/transcriptions:transcribe`                |
| API version      | `2025-10-15` (GA)                                                       |
| Auth             | `Ocp-Apim-Subscription-Key` header (backend only)                       |
| Body             | `multipart/form-data` with `audio` file bytes + JSON `definition`       |
| Alternative body | `audioUrl` supported by Azure — **not used** (no Blob SAS / public URL) |

Selected because recordings are short (≤ 180 s, ≤ 10 MiB), already uploaded
server-side, and need bounded latency with retryable HTTP semantics.

### Result fields used

- `combinedPhrases[].text` (primary transcript)
- `phrases[].locale` (detected locale when present)
- `phrases[].confidence` (averaged only when all values are valid 0–1)
- `durationMilliseconds` → `transcription.audioDurationSeconds`
- `apim-request-id` / `x-request-id` → opaque `providerRequestId` (not GraphQL)

### Result fields deliberately discarded

- Word-level timings (`words`)
- Diarisation / speaker IDs
- Channel separation details
- Raw Azure JSON body (never persisted)
- Raw Azure error messages (mapped to stable codes)

## Audio compatibility (no FFmpeg)

Azure documents direct support for WebM, Ogg/Opus, AAC, and M4A among others.

Phase 34A accepted formats therefore submit **original bytes**:

| Format        | Direct submit |
| ------------- | ------------- |
| WebM Opus     | Yes           |
| Ogg Opus      | Yes           |
| MP4 / M4A AAC | Yes           |

**Conversion decision:** FFmpeg is **not** required and is **not** installed in
the API Docker image (`node:22-alpine`). If Azure rejects a specific browser
encoding, transcription becomes `FAILED` with
`ROUTE_VOICE_TRANSCRIPTION_AUDIO_UNSUPPORTED` while the original Blob remains
playable.

Known browser note: Safari/iOS often produces M4A/AAC; Chromium often WebM Opus.
Both remain playable via Phase 34A streaming regardless of transcription outcome.

## Locale / AUTO

Allowed `requestedLocale` values (also accepted as upload `selectedLocale`):

- `en-GB`
- `nl-NL`
- `pl-PL`
- `AUTO`

Rules:

- Manual locale → Azure `definition.locales: ["<locale>"]`
- `AUTO` → exactly `["en-GB","nl-NL","pl-PL"]` (no unrestricted LID)
- `null`/omitted upload locale → `AUTO`
- Detected locale stored only when Azure returns one of the three allowed values
- No translation

## State model

Report **storage** status (Phase 34A) unchanged:

- `UPLOADING` → `AVAILABLE` | `UPLOAD_FAILED`

Nested `transcription` object (Phase 34B):

| Status       | Meaning                                 |
| ------------ | --------------------------------------- |
| `PENDING`    | Eligible; queued for in-process runner  |
| `PROCESSING` | Lease held; Azure call in flight        |
| `COMPLETED`  | Transcript persisted                    |
| `FAILED`     | Safe failure code; audio still playable |

Legacy AVAILABLE reports without `transcription` are **not** auto-backfilled at
startup. Use `enqueueLegacyAvailableReports(limit)` for bounded maintenance.

## Processing leases

- Lease TTL: `ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS` (default 600)
- Claim uses Mongo CAS (`updateOne` filter on status / expired lease)
- Only the current `processingLeaseId` may finalise success/failure
- Expired `PROCESSING` leases are recovered on startup / recovery scan

## Retries

Automatic:

- Transient: timeout, 429, 5xx, temporary network
- Permanent (no auto-retry): unsupported audio, invalid audio, auth rejection,
  no speech, invalid/oversized result, missing blob
- Max attempts: `ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS` (default 3)
- Bounded exponential delay between automatic attempts

Manual (ADMIN only):

`POST /delivery-routes/:routeId/voice-reports/:reportId/retry-transcription`

- HTTP 202 `{ reportId, transcriptionStatus: "PENDING" }`
- Idempotent while already `PENDING`
- Rejects `COMPLETED` / ineligible states
- Does not re-upload audio or change sequence number

## Startup recovery

On API `OnModuleInit` (when enabled):

1. Bounded query for `AVAILABLE` + `transcription.status=PENDING`
2. Bounded query for `AVAILABLE` + `PROCESSING` with expired lease
3. Schedule report IDs (not audio bytes)
4. Does **not** auto-retry permanent `FAILED`

Railway note: in-process queue is lost on restart; Mongo state + startup recovery
re-enqueues work. Prefer a single API replica (existing deployment guidance) to
minimise duplicate in-flight Azure calls; CAS still protects finalisation.

## Memory / concurrency

- Max audio buffer per job: 10 MiB (matches upload cap)
- Concurrency per API instance: 1–2 (`ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY`)
- Blob size checked against stored `sizeBytes` before download
- Upload HTTP request is **not** held open for Azure

## Transcript validation

- Require string; NFC normalise; trim surrounding whitespace only
- Max length: 8 000 characters
- Empty / no speech → `FAILED` / `ROUTE_VOICE_TRANSCRIPTION_NO_SPEECH`
- Never invent transcript text
- Never log transcript or audio bytes (correlation id only)

## Duration provenance

- `durationSeconds` — client-declared (Phase 34A, untrusted)
- `transcription.audioDurationSeconds` — Azure-derived when present
- GraphQL `effectiveDurationSeconds` prefers Azure, else client
- Large mismatches emit a diagnostic warning only (do not fail)

## GraphQL output

`RouteVoiceReport` adds:

- `transcriptionStatus`, `requestedLocale`, `detectedLocale`
- `transcript` (nullable), `confidence` (nullable)
- `transcriptionStartedAt`, `transcriptionCompletedAt`
- `transcriptionFailureCode` (safe code only)
- `effectiveDurationSeconds`
- `canRetryTranscription` — `true` only for ADMIN on eligible `FAILED`

Roles: ADMIN and assigned BEZORGER may read; APOTHEKER / unrelated courier
forbidden (unchanged).

Never exposed: lease id, provider request id, blob path, SHA-256, raw failure
message, Azure key/endpoint.

## Audit / PubSub privacy

Audit events (no transcript / audio / keys):

- `ROUTE_VOICE_REPORT_TRANSCRIPTION_COMPLETED`
- `ROUTE_VOICE_REPORT_TRANSCRIPTION_FAILED`
- `ROUTE_VOICE_REPORT_TRANSCRIPTION_RETRIED`

PubSub `routeVoiceReportUpdates` redacted payload:

- `routeId`, `reportId`, `status`, `transcriptionStatus`, `eventType`

Clients refetch authoritative GraphQL metadata after events.

## Environment variables

| Variable                                        | Notes                                     |
| ----------------------------------------------- | ----------------------------------------- |
| `ROUTE_VOICE_TRANSCRIPTION_ENABLED`             | Default `true`                            |
| `ROUTE_VOICE_TRANSCRIPTION_PROVIDER`            | `fake` (local/test) / `azure` (prod only) |
| `AZURE_SPEECH_ENDPOINT`                         | HTTPS Cognitive Services endpoint         |
| `AZURE_SPEECH_KEY`                              | Subscription key (never log / never Vite) |
| `ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS`          | Default 60000                             |
| `ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY`         | Default 1                                 |
| `ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS`        | Default 3                                 |
| `ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS`       | Default 600                               |
| `ROUTE_VOICE_TRANSCRIPTION_RECOVERY_BATCH_SIZE` | Default 25                                |

Production readiness fails when provider is `azure` (or production default)
without endpoint/key. Fake provider is explicit in local/test.

## Local fake-provider testing

Set `ROUTE_VOICE_TRANSCRIPTION_PROVIDER=fake`. Unit tests inject
`FakeRouteVoiceTranscriptionProvider` with scripted behaviours
(`success`, `timeout`, `throttled`, `unsupported_audio`, …).

## Future production provisioning

1. Create an Azure AI Speech (Cognitive Services) resource
2. Copy endpoint + key into Railway / compose secrets (not image layers)
3. Ensure `ROUTE_VOICE_TRANSCRIPTION_PROVIDER=azure`
4. Confirm private voice-report Blob container already exists (Phase 34A)
5. Deploy API; verify startup recovery logs stay free of keys/transcripts
6. Smoke-test upload → `PENDING` → `COMPLETED` with ADMIN GraphQL read + retry

## Out of scope (later phases)

- Microphone recording UI (Phase 34C+)
- LLM summarisation / classification / sentiment
- Transcript editing
- Offline report / IndexedDB transcript cache
- Push notifications containing transcript
