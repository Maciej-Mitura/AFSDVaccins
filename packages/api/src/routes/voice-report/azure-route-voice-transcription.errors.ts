/**
 * Safe provider-side errors for Azure Speech fast transcription.
 * Never include subscription keys, request bodies, or raw Azure messages.
 */

export type RouteVoiceTranscriptionProviderErrorKind =
  | 'timeout'
  | 'throttled'
  | 'unavailable'
  | 'rejected'
  | 'unsupported_audio'
  | 'no_speech'
  | 'result_invalid'
  | 'not_configured'
  | 'failed'

export class RouteVoiceTranscriptionProviderError extends Error {
  readonly kind: RouteVoiceTranscriptionProviderErrorKind
  readonly transient: boolean
  readonly httpStatus: number | null

  constructor(input: {
    kind: RouteVoiceTranscriptionProviderErrorKind
    transient: boolean
    message: string
    httpStatus?: number | null
  }) {
    super(input.message)
    this.name = 'RouteVoiceTranscriptionProviderError'
    this.kind = input.kind
    this.transient = input.transient
    this.httpStatus = input.httpStatus ?? null
  }
}

export function isRouteVoiceTranscriptionProviderError(
  error: unknown,
): error is RouteVoiceTranscriptionProviderError {
  return error instanceof RouteVoiceTranscriptionProviderError
}

/** Map HTTP / network failures to stable provider errors (no secrets). */
export function mapAzureSpeechHttpFailure(input: {
  status?: number
  code?: string | null
  aborted?: boolean
}): never {
  if (input.aborted) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'timeout',
      transient: true,
      message: 'Azure Speech transcription timed out',
      httpStatus: null,
    })
  }

  const status = input.status
  const code = (input.code ?? '').toLowerCase()

  if (status === 429) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'throttled',
      transient: true,
      message: 'Azure Speech transcription throttled',
      httpStatus: 429,
    })
  }

  if (status !== undefined && status >= 500) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'unavailable',
      transient: true,
      message: 'Azure Speech transcription unavailable',
      httpStatus: status,
    })
  }

  if (
    code.includes('invalidaudio') ||
    code.includes('emptyaudio') ||
    code.includes('unsupportedmedia') ||
    status === 415
  ) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'unsupported_audio',
      transient: false,
      message: 'Azure Speech rejected audio format',
      httpStatus: status ?? null,
    })
  }

  if (
    code.includes('nolanguage') ||
    code.includes('nospeech') ||
    code.includes('nolanguageidentified')
  ) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'no_speech',
      transient: false,
      message: 'Azure Speech recognised no speech',
      httpStatus: status ?? null,
    })
  }

  if (status === 401 || status === 403) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'rejected',
      transient: false,
      message: 'Azure Speech authentication rejected',
      httpStatus: status,
    })
  }

  if (status !== undefined && status >= 400 && status < 500) {
    throw new RouteVoiceTranscriptionProviderError({
      kind: 'rejected',
      transient: false,
      message: 'Azure Speech rejected the transcription request',
      httpStatus: status,
    })
  }

  throw new RouteVoiceTranscriptionProviderError({
    kind: 'failed',
    transient: true,
    message: 'Azure Speech transcription failed',
    httpStatus: status ?? null,
  })
}
