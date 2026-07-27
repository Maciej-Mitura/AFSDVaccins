/**
 * Explicit audio compatibility for Azure Speech fast transcription (Phase 34B).
 *
 * Azure documents direct support for: WAV, MP3, OPUS/OGG, FLAC, AAC, WebM, M4A, …
 * Phase 34A accepted containers (WebM Opus, Ogg Opus, MP4/M4A AAC) therefore
 * submit original bytes — no FFmpeg conversion.
 *
 * If Azure later rejects a specific browser encoding, transcription fails with
 * AUDIO_UNSUPPORTED while the original Blob remains playable.
 */

export type RouteVoiceTranscriptionCompatibility =
  | { outcome: 'submit_original' }
  | { outcome: 'unsupported'; reason: 'unknown_mime' | 'unknown_extension' }

const SUPPORTED_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
])

const SUPPORTED_EXTENSION = new Set(['webm', 'ogg', 'm4a', 'mp4'])

export function assessRouteVoiceTranscriptionCompatibility(input: {
  mimeType: string
  fileExtension: string
}): RouteVoiceTranscriptionCompatibility {
  const mime = (input.mimeType ?? '').split(';')[0]?.trim().toLowerCase()
  const ext = (input.fileExtension ?? '').trim().toLowerCase()

  if (!SUPPORTED_MIME.has(mime)) {
    return { outcome: 'unsupported', reason: 'unknown_mime' }
  }
  if (!SUPPORTED_EXTENSION.has(ext)) {
    return { outcome: 'unsupported', reason: 'unknown_extension' }
  }
  return { outcome: 'submit_original' }
}
