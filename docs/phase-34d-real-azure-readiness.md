# Phase 34D — Real Azure readiness for route voice reports

## Scope

Production hardening and **acceptance tooling** for route voice-report Azure
Blob Storage and Azure AI Speech. Makes real Azure setup testable without the
courier UI.

Out of scope:

- Creating Azure resources from Cursor
- Deploy / Railway mutation
- LLM summaries, transcript editing, new business features
- Committing credentials or real audio samples

## Architecture (real Azure mode)

```text
Courier/Admin PWA
  → authenticated multipart upload / GraphQL / private audio stream
  → NestJS API
      → Azure Blob (private container, Block Blob, no overwrite, Range)
      → Azure Speech fast transcription (multipart audio + definition)
      → Mongo report metadata + transcription state machine (34A/34B)
```

Production provider defaults:

| Variable                             | Production              |
| ------------------------------------ | ----------------------- |
| `VACCINE_IMAGE_STORAGE_PROVIDER`     | `azure` (fake rejected) |
| `ROUTE_VOICE_TRANSCRIPTION_PROVIDER` | `azure` (fake rejected) |
| `ROUTE_VOICE_TRANSCRIPTION_ENABLED`  | `true` (required)       |

Development may keep `fake` providers, or select `azure` explicitly for local
acceptance.

## Speech API contract

| Item          | Value                                                                    |
| ------------- | ------------------------------------------------------------------------ |
| Method / path | `POST {AZURE_SPEECH_ENDPOINT}/speechtotext/transcriptions:transcribe`    |
| API version   | **`2025-10-15`** (constant `AZURE_SPEECH_FAST_TRANSCRIBE_API_VERSION`)   |
| Auth          | Header `Ocp-Apim-Subscription-Key: {AZURE_SPEECH_KEY}`                   |
| Body          | `multipart/form-data` with parts `audio` + `definition`                  |
| Definition    | `{ "locales": ["en-GB"] }` or AUTO → exactly `["en-GB","nl-NL","pl-PL"]` |

`AZURE_SPEECH_ENDPOINT` is the **resource origin only**, e.g.

`https://<resource-name>.cognitiveservices.azure.com`

Rules:

- One optional trailing slash is normalised away
- Query strings, fragments, credentials, and request paths are rejected
- Application never permits arbitrary paths via config (no duplicated `/speechtotext`)
- Key never appears in URL, logs, GraphQL, or PWA env

Filename hints are format-based (`audio.webm` / `audio.ogg` / `audio.m4a`), never
user filenames. Multipart `Content-Type` boundary is left to `FormData`/`fetch`.

## Blob production contract

| Item         | Policy                                                                        |
| ------------ | ----------------------------------------------------------------------------- |
| Connection   | `AZURE_STORAGE_CONNECTION_STRING`                                             |
| Container    | `AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER` (default `route-voice-reports`) |
| Access       | **Private** — anonymous/public access must never be enabled                   |
| Blob type    | Block Blob                                                                    |
| Overwrite    | Disabled (`ifNoneMatch: '*'`)                                                 |
| Names        | Server-generated production paths; acceptance uses `_acceptance-tests/...`    |
| URLs         | No permanent SAS / public URL for voice audio                                 |
| Provisioning | Container must **pre-exist** for normal app/diagnose runs                     |

Optional acceptance-only flag `--create-container` may create a **private**
container idempotently. Normal diagnostics never silently create resources.

## Environment variables

| Variable                                        | Notes                              |
| ----------------------------------------------- | ---------------------------------- |
| `VACCINE_IMAGE_STORAGE_PROVIDER`                | `fake` \| `azure` (prod: azure)    |
| `AZURE_STORAGE_CONNECTION_STRING`               | Secret — never log                 |
| `AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER`   | Non-secret; private name           |
| `ROUTE_VOICE_TRANSCRIPTION_PROVIDER`            | `fake` \| `azure` (prod: azure)    |
| `ROUTE_VOICE_TRANSCRIPTION_ENABLED`             | Prod must be `true`                |
| `AZURE_SPEECH_ENDPOINT`                         | HTTPS origin only                  |
| `AZURE_SPEECH_KEY`                              | Secret — never log / never `VITE_` |
| `ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS`          | 5000–180000; default 60000         |
| `ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY`         | 1–2; default 1                     |
| `ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS`        | 1–5; default 3                     |
| `ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS`       | 120–900; must exceed timeout + 60s |
| `ROUTE_VOICE_TRANSCRIPTION_RECOVERY_BATCH_SIZE` | 1–100; default 25                  |

## Diagnostic command

```bash
npm run diagnose:voice-reports:azure
```

- Loads `packages/api/.env` via the normal Joi validation path
- Prints only safe fields (host, configured/not, container name, bounds)
- Never prints keys, connection strings, key suffixes, or SAS
- Exit non-zero when real Azure mode is selected but incomplete

Example safe lines:

```text
Azure Speech endpoint: configured (host: example.cognitiveservices.azure.com)
Azure Speech key: configured
Azure Storage connection: configured
Voice-report container: route-voice-reports
```

## Blob acceptance command

```bash
npm run test:voice-reports:azure-storage
npm run test:voice-reports:azure-storage -- --create-container
```

Behaviour: validate config → verify private container → upload small probe under
`_acceptance-tests/voice-reports/<uuid>/probe.bin` → metadata/SHA-256/range →
delete → cleanup in `finally`. No Mongo. No production route/report IDs.

## Speech acceptance command

```bash
npm run test:voice-reports:azure-speech -- --audio ./sample.webm --locale nl-NL
```

Locales: `en-GB` | `nl-NL` | `pl-PL` | `AUTO`.

Uses the production Speech adapter + production audio validator. Prints
transcript for this explicit developer command only. Never stores audio in Blob.
Never creates Mongo records.

**Do not commit** copyrighted or personal recordings. Record a short sample
locally (e.g. browser MediaRecorder or OS voice memo exported as WebM/Ogg/M4A)
and pass its path.

## Combined acceptance

```bash
npm run test:voice-reports:azure
npm run test:voice-reports:azure -- --audio ./sample.webm --locale nl-NL
```

1. Diagnostics
2. Blob acceptance
3. Speech acceptance only when `--audio` is supplied

Does not start NestJS.

## Optional integration tests

```bash
AZURE_VOICE_REPORT_INTEGRATION_TESTS=true npm run test:api -- azure-voice-report.integration
```

Skipped by default. Not required in CI. No committed audio. Always attempt Blob
cleanup. **Cost/network warning:** real Azure billable calls.

## Logging / privacy

May log: report ID, route ID, correlation ID, provider request ID, attempt,
failure code, elapsed time.

Must not log: transcript (except explicit Speech acceptance CLI), audio bytes,
connection string, Speech key, subscription header, multipart payload, raw Azure
error bodies that may echo content.

## Common failure mapping

| Azure / condition            | Safe outcome                             |
| ---------------------------- | ---------------------------------------- |
| Invalid Speech key / 401/403 | permanent `rejected` / provider rejected |
| Timeout / abort              | transient timeout                        |
| 429                          | transient throttled                      |
| 5xx                          | transient unavailable                    |
| Invalid audio                | permanent unsupported audio              |
| No speech                    | permanent no speech                      |
| Malformed success JSON       | permanent result invalid                 |
| Missing private container    | storage failure / not found              |
| Blob overwrite conflict      | storage failure                          |

Transcription failure never deletes playable audio. Storage failure never leaves
an `AVAILABLE` report. Raw Azure errors never reach the PWA.

## Railway / Docker checklist

Represented in:

- `packages/api/.env.example`
- `infrastructure/.env.prod.example`
- `infrastructure/docker-compose-production.yml`

Set on the **API** Railway service (backend only; no `VITE_`):

1. `VACCINE_IMAGE_STORAGE_PROVIDER=azure`
2. `AZURE_STORAGE_CONNECTION_STRING`
3. `AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER`
4. `ROUTE_VOICE_TRANSCRIPTION_PROVIDER=azure`
5. `ROUTE_VOICE_TRANSCRIPTION_ENABLED=true`
6. `AZURE_SPEECH_ENDPOINT`
7. `AZURE_SPEECH_KEY`
8. Optional timeout / concurrency / attempts / lease / recovery overrides

Changing these variables requires a Railway **redeploy/restart**. Do not embed
secrets in compose files.

Public `/health` does **not** expose Azure configuration.

## Manual Azure portal work still required

1. Create (or reuse) a Storage account
2. Create private container `route-voice-reports` (anonymous access **Off**)
3. Create Azure AI Speech / Cognitive Services resource
4. Copy endpoint origin + key into backend env (never commit)
5. Run local acceptance commands before production cutover

## Local real-Azure procedure

1. Set azure providers + secrets in ignored `packages/api/.env`
2. `npm run diagnose:voice-reports:azure`
3. `npm run test:voice-reports:azure-storage`
4. Record a short local sample; run Speech acceptance with `--audio`
5. Optionally `npm run test:voice-reports:azure -- --audio …`

## Production acceptance procedure

1. Confirm portal resources and private container
2. Set Railway API variables; redeploy
3. Validate offline readiness: `npm run validate:production-readiness`
4. From a trusted machine with the same secrets, run diagnose + Blob (+ Speech)
5. Smoke courier upload only after infrastructure acceptance passes

## Index

- [Phase 34A foundation](./phase-34a-route-voice-report-foundation.md)
- [Phase 34B Azure Speech](./phase-34b-azure-speech-transcription.md)
- [Phase 34C UI](./phase-34c-route-voice-report-ui.md)
- **Phase 34D real Azure readiness** (this document)
