import {
  assertHttpsSpeechEndpoint,
  azureSpeechFileNameHintForMime,
  buildAzureSpeechFastTranscribeUrl,
  AzureRouteVoiceTranscriptionProvider,
} from './azure-route-voice-transcription.provider'
import {
  buildAzureSpeechLocales,
  mapAzureFastTranscriptionBody,
  normaliseTranscriptText,
} from './azure-route-voice-transcription.mapper'
import { RouteVoiceTranscriptionProviderError } from './azure-route-voice-transcription.errors'
import { RouteVoiceTranscriptionLocale } from './route-voice-transcription-locale.enum'
import {
  AZURE_SPEECH_FAST_TRANSCRIBE_API_VERSION,
  ROUTE_VOICE_TRANSCRIPTION_MAX_TEXT_LENGTH,
} from './route-voice-transcription.constants'

describe('Azure Speech fast transcription adapter', () => {
  const audioBytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02])

  it('maps manual en-GB / nl-NL / pl-PL locales', () => {
    expect(buildAzureSpeechLocales(RouteVoiceTranscriptionLocale.EN_GB)).toEqual([
      'en-GB',
    ])
    expect(buildAzureSpeechLocales(RouteVoiceTranscriptionLocale.NL_NL)).toEqual([
      'nl-NL',
    ])
    expect(buildAzureSpeechLocales(RouteVoiceTranscriptionLocale.PL_PL)).toEqual([
      'pl-PL',
    ])
  })

  it('AUTO sends exactly three candidate languages', () => {
    expect(buildAzureSpeechLocales(RouteVoiceTranscriptionLocale.AUTO)).toEqual([
      'en-GB',
      'nl-NL',
      'pl-PL',
    ])
  })

  it('normalises trailing slash and builds exact 2025-10-15 URL', () => {
    expect(
      assertHttpsSpeechEndpoint(
        'https://example.cognitiveservices.azure.com/',
      ),
    ).toBe('https://example.cognitiveservices.azure.com')
    expect(
      buildAzureSpeechFastTranscribeUrl(
        'https://example.cognitiveservices.azure.com/',
      ),
    ).toBe(
      `https://example.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=${AZURE_SPEECH_FAST_TRANSCRIBE_API_VERSION}`,
    )
  })

  it('rejects Speech endpoints with query, path injection, or HTTP', () => {
    expect(() =>
      assertHttpsSpeechEndpoint(
        'https://example.cognitiveservices.azure.com?api-version=1',
      ),
    ).toThrow(/query string|fragment/i)
    expect(() =>
      assertHttpsSpeechEndpoint(
        'https://example.cognitiveservices.azure.com/speechtotext',
      ),
    ).toThrow(/origin only|request path/i)
    expect(() =>
      assertHttpsSpeechEndpoint(
        'http://example.cognitiveservices.azure.com',
      ),
    ).toThrow(/HTTPS/i)
  })

  it('maps MIME types to safe filename hints', () => {
    expect(azureSpeechFileNameHintForMime('audio/webm')).toBe('audio.webm')
    expect(azureSpeechFileNameHintForMime('audio/ogg;codecs=opus')).toBe(
      'audio.ogg',
    )
    expect(azureSpeechFileNameHintForMime('audio/mp4')).toBe('audio.m4a')
  })

  it('maps a successful manual locale fixture', () => {
    const mapped = mapAzureFastTranscriptionBody(
      {
        durationMilliseconds: 12500,
        combinedPhrases: [{ text: '  Hallo wereld  ' }],
        phrases: [
          { text: 'Hallo', locale: 'nl-NL', confidence: 0.9 },
          { text: 'wereld', locale: 'nl-NL', confidence: 0.8 },
        ],
      },
      'req-1',
    )
    expect(mapped.text).toBe('Hallo wereld')
    expect(mapped.detectedLocale).toBe('nl-NL')
    expect(mapped.confidence).toBeCloseTo(0.85)
    expect(mapped.audioDurationSeconds).toBe(12.5)
    expect(mapped.providerRequestId).toBe('req-1')
  })

  it('maps a successful AUTO detection fixture', () => {
    const mapped = mapAzureFastTranscriptionBody(
      {
        durationMilliseconds: 2100,
        combinedPhrases: [{ text: 'Good morning' }],
        phrases: [
          { text: 'Good morning', locale: 'en-GB', confidence: 0.91 },
        ],
      },
      'auto-req',
    )
    expect(mapped.detectedLocale).toBe('en-GB')
    expect(mapped.text).toBe('Good morning')
  })

  it('keeps missing confidence null and rejects invalid confidence', () => {
    const missing = mapAzureFastTranscriptionBody(
      {
        combinedPhrases: [{ text: 'Hello' }],
        phrases: [{ text: 'Hello', locale: 'en-GB' }],
      },
      null,
    )
    expect(missing.confidence).toBeNull()

    const invalid = mapAzureFastTranscriptionBody(
      {
        combinedPhrases: [{ text: 'Hello' }],
        phrases: [{ text: 'Hello', locale: 'en-GB', confidence: 1.5 }],
      },
      null,
    )
    expect(invalid.confidence).toBeNull()
  })

  it('maps empty transcript to NO_SPEECH', () => {
    expect(() =>
      mapAzureFastTranscriptionBody(
        { combinedPhrases: [{ text: '   ' }], phrases: [] },
        null,
      ),
    ).toThrow(RouteVoiceTranscriptionProviderError)
    try {
      mapAzureFastTranscriptionBody(
        { combinedPhrases: [{ text: '' }], phrases: [] },
        null,
      )
    } catch (error) {
      expect(error).toBeInstanceOf(RouteVoiceTranscriptionProviderError)
      expect((error as RouteVoiceTranscriptionProviderError).kind).toBe(
        'no_speech',
      )
    }
  })

  it('rejects malformed success bodies', () => {
    expect(() => mapAzureFastTranscriptionBody(null, null)).toThrow(
      /invalid transcription body/i,
    )
    expect(() => mapAzureFastTranscriptionBody('nope', null)).toThrow(
      /invalid transcription body/i,
    )
  })

  it('rejects oversized transcript', () => {
    const huge = 'x'.repeat(ROUTE_VOICE_TRANSCRIPTION_MAX_TEXT_LENGTH + 1)
    expect(() =>
      mapAzureFastTranscriptionBody(
        { combinedPhrases: [{ text: huge }], phrases: [] },
        null,
      ),
    ).toThrow(/maximum length|invalid/i)
  })

  it('normalises Unicode with NFC and trims only surrounding whitespace', () => {
    expect(normaliseTranscriptText('\u00e9')).toBe('é')
    expect(normaliseTranscriptText('  hi  ')).toBe('hi')
    expect(normaliseTranscriptText('Hello, World!')).toBe('Hello, World!')
  })

  it('sends multipart request with Ocp-Apim-Subscription-Key and api-version', async () => {
    let capturedUrl = ''
    let capturedHeaders: HeadersInit | undefined
    let capturedBody: FormData | undefined

    const provider = AzureRouteVoiceTranscriptionProvider.fromParts({
      endpoint: 'https://example.cognitiveservices.azure.com',
      key: 'super-secret-speech-key',
      timeoutMs: 10_000,
      fetchImpl: (url, init) => {
        capturedUrl = url
        capturedHeaders = init.headers
        capturedBody = init.body as FormData
        return Promise.resolve(
          new Response(
            JSON.stringify({
              durationMilliseconds: 1000,
              combinedPhrases: [{ text: 'ok' }],
              phrases: [{ text: 'ok', locale: 'en-GB', confidence: 0.7 }],
            }),
            { status: 200, headers: { 'apim-request-id': 'azure-req-9' } },
          ),
        )
      },
    })

    const result = await provider.transcribe({
      audioBytes,
      mimeType: 'audio/webm',
      requestedLocale: RouteVoiceTranscriptionLocale.EN_GB,
      fileNameHint: 'audio.webm',
      correlationId: 'corr-1',
    })

    expect(capturedUrl).toBe(
      `https://example.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=${AZURE_SPEECH_FAST_TRANSCRIBE_API_VERSION}`,
    )
    const headers = new Headers(capturedHeaders)
    expect(headers.get('Ocp-Apim-Subscription-Key')).toBe(
      'super-secret-speech-key',
    )
    expect(headers.get('Content-Type')).toBeNull()
    const definition = capturedBody?.get('definition')
    expect(definition).toBe(JSON.stringify({ locales: ['en-GB'] }))
    expect(capturedBody?.get('audio')).toBeTruthy()
    expect(result.text).toBe('ok')
    expect(result.providerRequestId).toBe('azure-req-9')
  })

  it('maps WebM / Ogg / M4A filename and MIME in multipart', async () => {
    const cases = [
      { mime: 'audio/webm', hint: 'audio.webm' },
      { mime: 'audio/ogg', hint: 'audio.ogg' },
      { mime: 'audio/mp4', hint: 'audio.m4a' },
    ] as const

    for (const item of cases) {
      let capturedBody: FormData | undefined
      const provider = AzureRouteVoiceTranscriptionProvider.fromParts({
        endpoint: 'https://example.cognitiveservices.azure.com',
        key: 'key',
        fetchImpl: (_url, init) => {
          capturedBody = init.body as FormData
          return Promise.resolve(
            new Response(
              JSON.stringify({
                combinedPhrases: [{ text: 'ok' }],
                phrases: [{ text: 'ok', locale: 'en-GB' }],
              }),
              { status: 200 },
            ),
          )
        },
      })
      await provider.transcribe({
        audioBytes,
        mimeType: item.mime,
        requestedLocale: RouteVoiceTranscriptionLocale.EN_GB,
        fileNameHint: item.hint,
        correlationId: 'c',
      })
      const audio = capturedBody?.get('audio')
      expect(audio).toBeTruthy()
      expect((audio as File).name).toBe(item.hint)
      expect((audio as File).type).toBe(item.mime)
    }
  })

  it('AUTO definition includes exactly three locales', async () => {
    let definition = ''
    const provider = AzureRouteVoiceTranscriptionProvider.fromParts({
      endpoint: 'https://example.cognitiveservices.azure.com',
      key: 'key',
      fetchImpl: (_url, init) => {
        const raw = (init.body as FormData).get('definition')
        definition = typeof raw === 'string' ? raw : ''
        return Promise.resolve(
          new Response(
            JSON.stringify({
              combinedPhrases: [{ text: 'ok' }],
              phrases: [{ text: 'ok', locale: 'pl-PL', confidence: 0.5 }],
            }),
            { status: 200 },
          ),
        )
      },
    })

    await provider.transcribe({
      audioBytes,
      mimeType: 'audio/ogg',
      requestedLocale: RouteVoiceTranscriptionLocale.AUTO,
      fileNameHint: 'audio.ogg',
      correlationId: 'corr-2',
    })

    expect(JSON.parse(definition)).toEqual({
      locales: ['en-GB', 'nl-NL', 'pl-PL'],
    })
  })

  it('maps timeout / 429 / 5xx / structured Azure audio error', async () => {
    const timeoutProvider = AzureRouteVoiceTranscriptionProvider.fromParts({
      endpoint: 'https://example.cognitiveservices.azure.com',
      key: 'key',
      timeoutMs: 5_000,
      fetchImpl: () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        return Promise.reject(error)
      },
    })
    await expect(
      timeoutProvider.transcribe({
        audioBytes,
        mimeType: 'audio/webm',
        requestedLocale: RouteVoiceTranscriptionLocale.NL_NL,
        fileNameHint: 'a.webm',
        correlationId: 'c',
      }),
    ).rejects.toMatchObject({ kind: 'timeout', transient: true })

    const throttled = AzureRouteVoiceTranscriptionProvider.fromParts({
      endpoint: 'https://example.cognitiveservices.azure.com',
      key: 'key',
      fetchImpl: () => Promise.resolve(new Response('{}', { status: 429 })),
    })
    await expect(
      throttled.transcribe({
        audioBytes,
        mimeType: 'audio/webm',
        requestedLocale: RouteVoiceTranscriptionLocale.NL_NL,
        fileNameHint: 'a.webm',
        correlationId: 'c',
      }),
    ).rejects.toMatchObject({ kind: 'throttled', transient: true })

    const unavailable = AzureRouteVoiceTranscriptionProvider.fromParts({
      endpoint: 'https://example.cognitiveservices.azure.com',
      key: 'key',
      fetchImpl: () => Promise.resolve(new Response('{}', { status: 503 })),
    })
    await expect(
      unavailable.transcribe({
        audioBytes,
        mimeType: 'audio/webm',
        requestedLocale: RouteVoiceTranscriptionLocale.NL_NL,
        fileNameHint: 'a.webm',
        correlationId: 'c',
      }),
    ).rejects.toMatchObject({ kind: 'unavailable', transient: true })

    const rejected = AzureRouteVoiceTranscriptionProvider.fromParts({
      endpoint: 'https://example.cognitiveservices.azure.com',
      key: 'key',
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { innerError: { code: 'InvalidAudioFormat' } },
            }),
            { status: 400 },
          ),
        ),
    })
    await expect(
      rejected.transcribe({
        audioBytes,
        mimeType: 'audio/mp4',
        requestedLocale: RouteVoiceTranscriptionLocale.PL_PL,
        fileNameHint: 'a.m4a',
        correlationId: 'c',
      }),
    ).rejects.toMatchObject({ kind: 'unsupported_audio', transient: false })
  })

  it('never includes credentials in thrown error messages', async () => {
    const secret = 'super-secret-speech-key-xyz'
    const provider = AzureRouteVoiceTranscriptionProvider.fromParts({
      endpoint: 'https://example.cognitiveservices.azure.com',
      key: secret,
      fetchImpl: () => Promise.resolve(new Response('nope', { status: 401 })),
    })
    try {
      await provider.transcribe({
        audioBytes,
        mimeType: 'audio/webm',
        requestedLocale: RouteVoiceTranscriptionLocale.EN_GB,
        fileNameHint: 'a.webm',
        correlationId: 'c',
      })
      throw new Error('expected throw')
    } catch (error) {
      expect(String(error)).not.toContain(secret)
      expect(JSON.stringify(error)).not.toContain(secret)
    }
  })
})
