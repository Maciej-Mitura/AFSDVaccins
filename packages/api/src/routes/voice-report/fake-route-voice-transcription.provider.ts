import { Injectable } from '@nestjs/common'

import { RouteVoiceTranscriptionLocale } from './route-voice-transcription-locale.enum'
import type {
  RouteVoiceTranscriptionProvider,
  RouteVoiceTranscriptionProviderResult,
  RouteVoiceTranscriptionRequest,
} from './route-voice-transcription.provider'
import { RouteVoiceTranscriptionProviderError } from './azure-route-voice-transcription.errors'

export type FakeTranscriptionBehaviour =
  | {
      kind: 'success'
      text?: string
      detectedLocale?: string | null
      confidence?: number | null
      audioDurationSeconds?: number | null
      providerRequestId?: string | null
    }
  | { kind: 'empty' }
  | { kind: 'timeout' }
  | { kind: 'throttled' }
  | { kind: 'unavailable' }
  | { kind: 'unsupported_audio' }
  | { kind: 'rejected' }
  | { kind: 'oversized' }

/**
 * Explicit test/local fake — never calls Azure.
 * Configure behaviour via setNextBehaviour / setDefaultBehaviour.
 */
@Injectable()
export class FakeRouteVoiceTranscriptionProvider
  implements RouteVoiceTranscriptionProvider
{
  private defaultBehaviour: FakeTranscriptionBehaviour = {
    kind: 'success',
    text: 'Fake transcript',
    detectedLocale: 'nl-NL',
    confidence: 0.91,
    audioDurationSeconds: 12.5,
    providerRequestId: 'fake-request-1',
  }
  private queue: FakeTranscriptionBehaviour[] = []
  readonly calls: RouteVoiceTranscriptionRequest[] = []

  setDefaultBehaviour(behaviour: FakeTranscriptionBehaviour): void {
    this.defaultBehaviour = behaviour
  }

  setNextBehaviour(behaviour: FakeTranscriptionBehaviour): void {
    this.queue.push(behaviour)
  }

  clearCalls(): void {
    this.calls.length = 0
  }

  transcribe(
    input: RouteVoiceTranscriptionRequest,
  ): Promise<RouteVoiceTranscriptionProviderResult> {
    this.calls.push({
      ...input,
      audioBytes: Buffer.from(input.audioBytes),
    })

    const behaviour = this.queue.shift() ?? this.defaultBehaviour
    switch (behaviour.kind) {
      case 'success': {
        const detected =
          behaviour.detectedLocale !== undefined
            ? behaviour.detectedLocale
            : input.requestedLocale === RouteVoiceTranscriptionLocale.AUTO
              ? 'nl-NL'
              : input.requestedLocale
        return Promise.resolve({
          text: behaviour.text ?? 'Fake transcript',
          detectedLocale: detected,
          confidence:
            behaviour.confidence === undefined ? 0.91 : behaviour.confidence,
          audioDurationSeconds:
            behaviour.audioDurationSeconds === undefined
              ? 12.5
              : behaviour.audioDurationSeconds,
          providerRequestId:
            behaviour.providerRequestId === undefined
              ? 'fake-request-1'
              : behaviour.providerRequestId,
        })
      }
      case 'empty':
        return Promise.reject(
          new RouteVoiceTranscriptionProviderError({
            kind: 'no_speech',
            transient: false,
            message: 'Fake empty transcript',
          }),
        )
      case 'timeout':
        return Promise.reject(
          new RouteVoiceTranscriptionProviderError({
            kind: 'timeout',
            transient: true,
            message: 'Fake timeout',
          }),
        )
      case 'throttled':
        return Promise.reject(
          new RouteVoiceTranscriptionProviderError({
            kind: 'throttled',
            transient: true,
            message: 'Fake throttled',
            httpStatus: 429,
          }),
        )
      case 'unavailable':
        return Promise.reject(
          new RouteVoiceTranscriptionProviderError({
            kind: 'unavailable',
            transient: true,
            message: 'Fake unavailable',
            httpStatus: 503,
          }),
        )
      case 'unsupported_audio':
        return Promise.reject(
          new RouteVoiceTranscriptionProviderError({
            kind: 'unsupported_audio',
            transient: false,
            message: 'Fake unsupported audio',
          }),
        )
      case 'rejected':
        return Promise.reject(
          new RouteVoiceTranscriptionProviderError({
            kind: 'rejected',
            transient: false,
            message: 'Fake rejected',
            httpStatus: 401,
          }),
        )
      case 'oversized':
        return Promise.reject(
          new RouteVoiceTranscriptionProviderError({
            kind: 'result_invalid',
            transient: false,
            message: 'Fake oversized transcript',
          }),
        )
      default: {
        const _exhaustive: never = behaviour
        return Promise.resolve(_exhaustive)
      }
    }
  }
}
