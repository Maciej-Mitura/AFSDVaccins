import { Injectable } from '@nestjs/common'

import {
  AZURE_SPEECH_FAST_TRANSCRIBE_API_VERSION,
  AZURE_SPEECH_FAST_TRANSCRIBE_PATH,
  ROUTE_VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES,
  ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS_DEFAULT,
  ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS_MAX,
  ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS_MIN,
} from './route-voice-transcription.constants'
import {
  mapAzureSpeechHttpFailure,
  RouteVoiceTranscriptionProviderError,
} from './azure-route-voice-transcription.errors'
import {
  buildAzureSpeechLocales,
  mapAzureFastTranscriptionBody,
} from './azure-route-voice-transcription.mapper'
import type {
  RouteVoiceTranscriptionProvider,
  RouteVoiceTranscriptionProviderResult,
  RouteVoiceTranscriptionRequest,
} from './route-voice-transcription.provider'

export type AzureRouteVoiceTranscriptionConfig = {
  endpoint: string
  key: string
  timeoutMs: number
}

type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<Response>

/**
 * Azure AI Speech fast transcription adapter (REST api-version 2025-10-15).
 *
 * Submits original audio bytes via multipart/form-data (no Blob SAS URL).
 * Supported direct inputs for Phase 34A formats: WebM, Ogg Opus, MP4/M4A AAC.
 * No FFmpeg conversion — Azure documents these containers/codecs.
 *
 * Memory: one bounded buffer ≤ 10 MiB per in-flight job (runner concurrency ≤ 2).
 */
@Injectable()
export class AzureRouteVoiceTranscriptionProvider
  implements RouteVoiceTranscriptionProvider
{
  private readonly endpoint: string
  private readonly key: string
  private readonly timeoutMs: number
  private readonly fetchImpl: FetchLike

  private constructor(
    endpoint: string,
    key: string,
    timeoutMs: number,
    fetchImpl: FetchLike,
  ) {
    this.endpoint = endpoint
    this.key = key
    this.timeoutMs = timeoutMs
    this.fetchImpl = fetchImpl
  }

  static fromConfig(
    config: AzureRouteVoiceTranscriptionConfig,
    fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  ): AzureRouteVoiceTranscriptionProvider {
    return new AzureRouteVoiceTranscriptionProvider(
      assertHttpsSpeechEndpoint(config.endpoint),
      assertNonEmptySpeechKey(config.key),
      assertSpeechTimeoutMs(config.timeoutMs),
      fetchImpl,
    )
  }

  /** Test seam. */
  static fromParts(input: {
    endpoint: string
    key: string
    timeoutMs?: number
    fetchImpl: FetchLike
  }): AzureRouteVoiceTranscriptionProvider {
    return new AzureRouteVoiceTranscriptionProvider(
      assertHttpsSpeechEndpoint(input.endpoint),
      assertNonEmptySpeechKey(input.key),
      assertSpeechTimeoutMs(
        input.timeoutMs ?? ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS_DEFAULT,
      ),
      input.fetchImpl,
    )
  }

  async transcribe(
    input: RouteVoiceTranscriptionRequest,
  ): Promise<RouteVoiceTranscriptionProviderResult> {
    if (!Buffer.isBuffer(input.audioBytes) || input.audioBytes.length === 0) {
      throw new RouteVoiceTranscriptionProviderError({
        kind: 'unsupported_audio',
        transient: false,
        message: 'Transcription requires non-empty audio bytes',
      })
    }
    if (input.audioBytes.length > ROUTE_VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES) {
      throw new RouteVoiceTranscriptionProviderError({
        kind: 'unsupported_audio',
        transient: false,
        message: 'Audio exceeds transcription size limit',
      })
    }

    const url = buildAzureSpeechFastTranscribeUrl(this.endpoint)
    const form = new FormData()
    const mimeType = input.mimeType || 'application/octet-stream'
    const blob = new Blob([new Uint8Array(input.audioBytes)], {
      type: mimeType,
    })
    const fileName =
      input.fileNameHint?.trim() || azureSpeechFileNameHintForMime(mimeType)
    form.append('audio', blob, fileName)
    form.append(
      'definition',
      JSON.stringify({
        locales: buildAzureSpeechLocales(input.requestedLocale),
      }),
    )

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
          Accept: 'application/json',
        },
        body: form,
        signal: controller.signal,
      })

      const requestId =
        response.headers.get('apim-request-id') ??
        response.headers.get('x-request-id') ??
        null

      if (!response.ok) {
        const code = await readSafeErrorCode(response)
        mapAzureSpeechHttpFailure({
          status: response.status,
          code,
        })
      }

      const rawText = await response.text()
      if (rawText.length > 2_000_000) {
        throw new RouteVoiceTranscriptionProviderError({
          kind: 'result_invalid',
          transient: false,
          message: 'Azure Speech response exceeded size bound',
        })
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(rawText) as unknown
      } catch {
        throw new RouteVoiceTranscriptionProviderError({
          kind: 'result_invalid',
          transient: false,
          message: 'Azure Speech returned non-JSON body',
        })
      }

      return mapAzureFastTranscriptionBody(
        parsed,
        sanitizeProviderRequestId(requestId),
      )
    } catch (error) {
      if (isRouteVoiceTranscriptionProviderError(error)) {
        throw error
      }
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        mapAzureSpeechHttpFailure({ aborted: true })
      }
      // Network failure — never include cause message (may echo URLs/keys).
      throw new RouteVoiceTranscriptionProviderError({
        kind: 'unavailable',
        transient: true,
        message: 'Azure Speech network failure',
      })
    } finally {
      clearTimeout(timer)
    }
  }
}

function isRouteVoiceTranscriptionProviderError(
  error: unknown,
): error is RouteVoiceTranscriptionProviderError {
  return error instanceof RouteVoiceTranscriptionProviderError
}

/**
 * Normalise AZURE_SPEECH_ENDPOINT to the Azure resource origin only.
 * Accepts one optional trailing slash; rejects query strings, fragments, and
 * request-path injection (including duplicated /speechtotext).
 */
export function assertHttpsSpeechEndpoint(endpoint: string): string {
  if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'not_configured',
      transient: false,
      message: 'AZURE_SPEECH_ENDPOINT is required',
    })
  }
  const trimmed = endpoint.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'not_configured',
      transient: false,
      message: 'AZURE_SPEECH_ENDPOINT must be a valid HTTPS URL',
    })
  }
  if (parsed.protocol !== 'https:') {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'not_configured',
      transient: false,
      message: 'AZURE_SPEECH_ENDPOINT must use HTTPS',
    })
  }
  if (parsed.username || parsed.password) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'not_configured',
      transient: false,
      message: 'AZURE_SPEECH_ENDPOINT must not include credentials',
    })
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'not_configured',
      transient: false,
      message: 'AZURE_SPEECH_ENDPOINT must not include a query string or fragment',
    })
  }
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/'
  if (pathname !== '/') {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'not_configured',
      transient: false,
      message:
        'AZURE_SPEECH_ENDPOINT must be the resource origin only (no request path)',
    })
  }
  // Origin only; path + api-version are appended by the provider constant.
  return `https://${parsed.host}`
}

/** Build the exact fast-transcription URL (api-version centralised). */
export function buildAzureSpeechFastTranscribeUrl(endpoint: string): string {
  const normalised = assertHttpsSpeechEndpoint(endpoint)
  return `${normalised}${AZURE_SPEECH_FAST_TRANSCRIBE_PATH}?api-version=${AZURE_SPEECH_FAST_TRANSCRIBE_API_VERSION}`
}

/** Safe host for diagnostics — never returns credentials or full URL with key. */
export function safeAzureSpeechEndpointHost(endpoint: string): string | null {
  try {
    return new URL(assertHttpsSpeechEndpoint(endpoint)).host
  } catch {
    return null
  }
}

/** Bounded filename hint for multipart (format-based; never user filename). */
export function azureSpeechFileNameHintForMime(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base === 'audio/webm') {
    return 'audio.webm'
  }
  if (base === 'audio/ogg') {
    return 'audio.ogg'
  }
  if (
    base === 'audio/mp4' ||
    base === 'audio/x-m4a' ||
    base === 'audio/aac'
  ) {
    return 'audio.m4a'
  }
  return 'audio.bin'
}

export function assertNonEmptySpeechKey(key: string): string {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'not_configured',
      transient: false,
      message: 'AZURE_SPEECH_KEY is required',
    })
  }
  return key.trim()
}

export function assertSpeechTimeoutMs(timeoutMs: number): number {
  if (
    typeof timeoutMs !== 'number' ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS_MIN ||
    timeoutMs > ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS_MAX
  ) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'not_configured',
      transient: false,
      message: 'ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS out of bounds',
    })
  }
  return timeoutMs
}

function sanitizeProviderRequestId(raw: string | null): string | null {
  if (!raw) {
    return null
  }
  const trimmed = raw.trim().slice(0, 64)
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    return null
  }
  return trimmed
}

async function readSafeErrorCode(response: Response): Promise<string | null> {
  try {
    const text = await response.text()
    if (text.length > 4_096) {
      return null
    }
    const parsed = JSON.parse(text) as {
      error?: { code?: unknown; innerError?: { code?: unknown } }
      innerError?: { code?: unknown }
    }
    const code =
      parsed?.error?.innerError?.code ??
      parsed?.error?.code ??
      parsed?.innerError?.code
    return typeof code === 'string' ? code.slice(0, 64) : null
  } catch {
    return null
  }
}
