# Phase 34C — Route voice-report UI (recording, upload, playback, transcription)

## Scope

PWA courier and admin UI for **route-scoped operational voice reports**:

- Browser microphone recording via `MediaRecorder`
- Preview before upload
- Authenticated multipart upload
- Report list / timeline
- Authenticated private audio playback (Blob URLs)
- Transcription status / transcript display
- Admin transcription retry
- PubSub-driven refetch of authoritative GraphQL metadata

Out of scope:

- LLM summarisation / classification (later phase)
- Transcript editing
- Offline recording or queued uploads
- Push notifications containing report content
- Changes to Phase 34A storage architecture
- Changes to Phase 34B transcription formulas / state semantics
- Deploy
- Real Azure portal provisioning (see Phase 34D)

## Architecture

| Piece                         | Location                                                                   |
| ----------------------------- | -------------------------------------------------------------------------- |
| GraphQL query / subscription  | `packages/pwa/src/assets/graphql/route-voice-reports.ts`                   |
| REST upload / audio / retry   | `packages/pwa/src/api/route-voice-report-rest.ts`                          |
| Error mapping                 | `packages/pwa/src/api/route-voice-report-errors.ts`                        |
| `useVoiceRecorder`            | `packages/pwa/src/composables/voice-report/useVoiceRecorder.ts`            |
| `useRouteVoiceReports`        | `packages/pwa/src/composables/voice-report/useRouteVoiceReports.ts`        |
| `useAuthenticatedAudioSource` | `packages/pwa/src/composables/voice-report/useAuthenticatedAudioSource.ts` |
| MIME / state helpers          | `packages/pwa/src/composables/voice-report/voice-recorder-types.ts`        |
| Courier + admin shell         | `FeatureRouteVoiceRecorder.vue`                                            |
| Report list / card            | `FeatureRouteVoiceReportList.vue`, `FeatureRouteVoiceReportCard.vue`       |

Courier mount: `/bezorger/today` (`ViewBezorgerTodayRoute.vue`).  
Admin mount: generated route cards (`ViewAdminRoutePlanning.vue`).  
APOTHEKER: no UI and no query.

## MediaRecorder format selection

Preferred order (first supported wins via `MediaRecorder.isTypeSupported`):

1. `audio/webm;codecs=opus`
2. `audio/ogg;codecs=opus`
3. `audio/mp4`
4. `audio/webm`
5. Browser default when explicit types are unsupported but `MediaRecorder` works

Safari/iOS is **not** forced onto WebM. The actual `recorder.mimeType` / Blob type is what gets uploaded.

If `MediaRecorder` or `getUserMedia` is unavailable (or insecure context):

- Recording controls are disabled with a clear unsupported-browser message
- Report listing and playback remain available

No third-party MediaRecorder polyfill is used.

## Permission handling

- Request: `navigator.mediaDevices.getUserMedia({ audio: true })` only
- Recording starts only after an explicit courier action
- Permission denial is not auto-retried
- Errors map to bounded i18n keys (`permissionDenied`, `microphoneUnavailable`, `unsupportedBrowser`, …)

## Recording state machine

```
IDLE → REQUESTING_PERMISSION → RECORDING
RECORDING ⇄ PAUSED
RECORDING|PAUSED → STOPPING → PREVIEW
RECORDING|PAUSED → IDLE (cancel)
PREVIEW → UPLOADING → UPLOADED → IDLE
PREVIEW → IDLE (discard)
* → ERROR → safe reset / IDLE
```

Pause/resume uses native `MediaRecorder.pause` / `resume` when present; otherwise those controls are hidden.

## Duration and size limits

| Limit            | Value                                         |
| ---------------- | --------------------------------------------- |
| Minimum duration | 1 s (client reject)                           |
| Warning          | 150 s                                         |
| Hard maximum     | 180 s → auto-stop to preview (no auto-upload) |
| Max Blob size    | 10 MiB (client reject before upload)          |

Elapsed time excludes paused segments where practical.

## Stream cleanup

Microphone tracks are stopped when recording stops/cancels, upload begins, the component unmounts, the route leaves `IN_PROGRESS`, or recorder errors. Preview and playback Blob URLs are revoked on discard, successful upload, replacement, and unmount.

## Preview and upload lifecycle

After stop:

- Local Blob URL preview (no autoplay)
- Editable language until upload (`AUTO` / `en-GB` / `nl-NL` / `pl-PL`)
- Default language follows UI locale when mapped; otherwise `AUTO`
- Discard or Upload

Upload `FormData` fields:

- `audio`
- `clientRecordedAt` (recording start ISO time — not upload time)
- `durationSeconds`
- `selectedLocale`
- `clientUploadId`

`clientUploadId` is generated at recording start, kept stable across transport retries for the same Blob, and regenerated for each new recording. Firebase bearer auth is used; one forced token refresh after HTTP 401.

On transport failure the preview Blob and `clientUploadId` are retained for explicit retry. Domain failures (route no longer in progress, limit reached) keep the preview long enough to listen and discard — nothing is queued offline.

## Online-only behaviour / no offline persistence

- Start recording requires online + `todayRouteSource === 'SERVER'` + `IN_PROGRESS`
- CACHE / offline: no report GraphQL query, no cached report metadata, no recording
- Connectivity loss mid-recording: local finish/preview allowed; upload disabled until online; leaving/reloading loses the unsent Blob
- Audio / transcripts are **never** written to IndexedDB, Cache Storage, service-worker caches, or pending offline actions
- Forbidden offline snapshot fields include `voiceReports`, `transcript`, etc. (`route-snapshot.ts`)
- Service worker remains NetworkOnly for API/GraphQL; voice-report REST paths are not SW-cached

## Authenticated audio playback

`<audio src>` must **not** point at the authenticated REST endpoint (no Firebase headers on media elements).

On explicit user action:

1. `GET …/voice-reports/:id/audio` with bearer token (+ one 401 refresh)
2. Validate allow-listed `Content-Type`
3. `URL.createObjectURL(blob)`
4. Bind Blob URL to `<audio>`
5. Revoke on card unload / replacement / unmount

Full-blob fetch is acceptable for ≤10 MiB recordings. Backend Range streaming remains available for other clients.

## PubSub / refetch

Subscription: `routeVoiceReportUpdates` (redacted — no transcript).

On event for the active `routeId`:

- Debounced refetch of `routeVoiceReports`
- Partial event payloads are never treated as authoritative report data
- Subscription cleaned up on route change / unmount / disable

## Courier UI

Section **Route reports** on `/bezorger/today`:

- Recorder only when assigned route is `IN_PROGRESS`, online, SERVER source
- `ASSIGNED`: explains reports become available after start
- `COMPLETED` / `CANCELLED`: list read-only, no creation
- Privacy notice near recording controls
- Courier cannot retry transcription

## Admin UI

Section **Live route reports** on each generated route card:

- Sequence, courier display name, times, languages, duration, transcription status, transcript, playback
- Retry when `canRetryTranscription`
- Empty state when none
- Visible for `IN_PROGRESS`, `COMPLETED`, `CANCELLED`
- Admin cannot record

## Transcript states

| Status       | UI                                                                      |
| ------------ | ----------------------------------------------------------------------- |
| `PENDING`    | Waiting for transcription                                               |
| `PROCESSING` | Transcribing…                                                           |
| `COMPLETED`  | Transcript as plain text (no `v-html`), locales, optional confidence    |
| `FAILED`     | Safe mapped explanation; audio still playable; ADMIN retry when allowed |

Failure codes (`NO_SPEECH`, provider timeout/throttle/unavailable, …) map to i18n — never raw Azure/Nest messages.

## Accessibility

- Native buttons; `aria-live` recording status
- Explicit pause/resume/stop labels; elapsed time accessible text
- Recording indicator is not colour-only (`motion-safe:animate-pulse` respects reduced motion)
- Language selector labelled; transcript section headed
- Retry buttons name the affected report
- Navigation `beforeunload` / `onBeforeRouteLeave` warn only while an unsent recording exists

## Mobile / browser limitations

- Touch targets use project `min-h-12` / `min-h-14` patterns
- Preview stacks vertically on narrow viewports
- Safari/iOS typically records M4A/`audio/mp4`; Chromium typically WebM Opus — both accepted by Phase 34A
- Orientation change must not destroy an in-progress recording (state held in composable)
- Physical-device acceptance is still pending

## Local fake-provider test flow

1. Run API with fake voice-report storage + fake / configured transcription provider as in Phase 34A/34B docs
2. Start an `IN_PROGRESS` route as assigned BEZORGER
3. Record → preview → upload from `/bezorger/today`
4. Confirm list refetch and transcription status transitions via PubSub
5. As ADMIN, open route planning, play audio, retry a failed transcription

## Physical-device acceptance (pending)

- iOS Safari microphone permission + M4A upload
- Android Chrome WebM Opus upload
- Background-tab / lock-screen behaviour during recording
- Real Azure Speech path in a non-production environment

## i18n

Keys live in `packages/i18n-export/src/phase34c-keys.ts`.

```bash
npm exec --workspace=@vaccin-delivery/i18n-export -- tsx src/sync-phase34c-keys.ts
npm run export:i18n
# or local merge without Sheets:
npm exec --workspace=@vaccin-delivery/i18n-export -- tsx src/apply-phase34c-locales.ts
```

EN + NL complete; ES/ZH use English (Default) fallback.
