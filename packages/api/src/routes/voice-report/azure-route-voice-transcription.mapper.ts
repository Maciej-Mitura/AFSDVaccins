import {
  ROUTE_VOICE_TRANSCRIPTION_AUTO_CANDIDATE_LOCALES,
  RouteVoiceTranscriptionLocale,
} from './route-voice-transcription-locale.enum'
import {
  ROUTE_VOICE_TRANSCRIPTION_MAX_TEXT_LENGTH,
} from './route-voice-transcription.constants'
import {
  RouteVoiceTranscriptionProviderError,
} from './azure-route-voice-transcription.errors'
import type { RouteVoiceTranscriptionProviderResult } from './route-voice-transcription.provider'

const ALLOWED_DETECTED = new Set<string>(
  ROUTE_VOICE_TRANSCRIPTION_AUTO_CANDIDATE_LOCALES,
)

type AzurePhrase = {
  text?: unknown
  locale?: unknown
  confidence?: unknown
}

type AzureCombinedPhrase = {
  text?: unknown
}

type AzureTranscribeBody = {
  durationMilliseconds?: unknown
  combinedPhrases?: unknown
  phrases?: unknown
}

/**
 * Map Azure fast-transcription JSON to a provider-neutral result.
 * Deliberately discards: words, word timings, diarisation, channels, raw body.
 */
export function mapAzureFastTranscriptionBody(
  body: unknown,
  providerRequestId: string | null,
): RouteVoiceTranscriptionProviderResult {
  if (!body || typeof body !== 'object') {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'result_invalid',
      transient: false,
      message: 'Azure Speech returned an invalid transcription body',
    })
  }

  const typed = body as AzureTranscribeBody
  const text = extractCombinedText(typed)
  const normalised = normaliseTranscriptText(text)

  if (normalised.length === 0) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'no_speech',
      transient: false,
      message: 'Azure Speech returned empty transcript',
    })
  }

  if (normalised.length > ROUTE_VOICE_TRANSCRIPTION_MAX_TEXT_LENGTH) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'result_invalid',
      transient: false,
      message: 'Azure Speech transcript exceeded maximum length',
    })
  }

  const phrases = Array.isArray(typed.phrases)
    ? (typed.phrases as AzurePhrase[])
    : []

  return {
    text: normalised,
    detectedLocale: extractDetectedLocale(phrases),
    confidence: extractConfidence(phrases),
    audioDurationSeconds: extractDurationSeconds(typed.durationMilliseconds),
    providerRequestId,
  }
}

export function buildAzureSpeechLocales(
  requested: RouteVoiceTranscriptionLocale,
): string[] {
  if (requested === RouteVoiceTranscriptionLocale.AUTO) {
    return [...ROUTE_VOICE_TRANSCRIPTION_AUTO_CANDIDATE_LOCALES]
  }
  return [requested]
}

export function normaliseTranscriptText(raw: string): string {
  // NFC + trim surrounding whitespace only; preserve punctuation/casing.
  return raw.normalize('NFC').replace(/^\s+|\s+$/g, '')
}

function extractCombinedText(body: AzureTranscribeBody): string {
  if (Array.isArray(body.combinedPhrases)) {
    const parts = (body.combinedPhrases as AzureCombinedPhrase[])
      .map(phrase => (typeof phrase?.text === 'string' ? phrase.text : ''))
      .filter(part => part.length > 0)
    if (parts.length > 0) {
      return parts.join(' ')
    }
  }

  if (Array.isArray(body.phrases)) {
    const parts = (body.phrases as AzurePhrase[])
      .map(phrase => (typeof phrase?.text === 'string' ? phrase.text : ''))
      .filter(part => part.length > 0)
    if (parts.length > 0) {
      return parts.join(' ')
    }
  }

  return ''
}

function extractDetectedLocale(phrases: AzurePhrase[]): string | null {
  for (const phrase of phrases) {
    if (typeof phrase.locale !== 'string') {
      continue
    }
    const locale = phrase.locale.trim()
    if (ALLOWED_DETECTED.has(locale)) {
      return locale
    }
  }
  return null
}

function extractConfidence(phrases: AzurePhrase[]): number | null {
  const values: number[] = []
  for (const phrase of phrases) {
    if (typeof phrase.confidence !== 'number' || !Number.isFinite(phrase.confidence)) {
      continue
    }
    if (phrase.confidence < 0 || phrase.confidence > 1) {
      continue
    }
    values.push(phrase.confidence)
  }
  if (values.length === 0) {
    return null
  }
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  // Clamp for floating-point noise only; never invent confidence.
  return Math.min(1, Math.max(0, avg))
}

function extractDurationSeconds(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return null
  }
  const seconds = raw / 1000
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null
  }
  return Math.round(seconds * 1000) / 1000
}
