import {
  buildIdempotencyFingerprint,
  generateRouteVoiceReportBlobName,
  parseClientRecordedAt,
  parseClientUploadId,
  parseDurationSeconds,
  parseSelectedLocale,
  validateRouteVoiceReportAudio,
} from './route-voice-report-audio.validation'
import {
  RouteVoiceReportAudioEmptyException,
  RouteVoiceReportAudioRequiredException,
  RouteVoiceReportAudioSignatureInvalidException,
  RouteVoiceReportAudioTooLargeException,
  RouteVoiceReportAudioTypeUnsupportedException,
  RouteVoiceReportClientUploadIdInvalidException,
  RouteVoiceReportDurationInvalidException,
  RouteVoiceReportLocaleInvalidException,
  RouteVoiceReportTimestampInvalidException,
} from './route-voice-report.exceptions'
import { ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES } from './route-voice-report.constants'

/** Minimal EBML/WebM header. */
function webmFixture(extraBytes = 32): Buffer {
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.alloc(extraBytes, 0x01),
  ])
}

/** Minimal Ogg header. */
function oggFixture(extraBytes = 32): Buffer {
  return Buffer.concat([
    Buffer.from('OggS', 'ascii'),
    Buffer.alloc(extraBytes, 0x02),
  ])
}

/** Minimal MP4 ftyp with M4A brand. */
function mp4Fixture(extraBytes = 32): Buffer {
  const header = Buffer.alloc(12)
  header.writeUInt32BE(12 + extraBytes, 0)
  header.write('ftyp', 4, 'ascii')
  header.write('M4A ', 8, 'ascii')
  return Buffer.concat([header, Buffer.alloc(extraBytes, 0x03)])
}

describe('route-voice-report-audio.validation', () => {
  it('rejects missing audio', () => {
    expect(() => validateRouteVoiceReportAudio({ bytes: null })).toThrow(
      RouteVoiceReportAudioRequiredException,
    )
  })

  it('rejects empty audio', () => {
    expect(() =>
      validateRouteVoiceReportAudio({ bytes: Buffer.alloc(0) }),
    ).toThrow(RouteVoiceReportAudioEmptyException)
  })

  it('rejects audio over 10 MiB', () => {
    const bytes = Buffer.concat([
      webmFixture(0),
      Buffer.alloc(ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES),
    ])
    expect(() => validateRouteVoiceReportAudio({ bytes })).toThrow(
      RouteVoiceReportAudioTooLargeException,
    )
  })

  it('rejects invalid signature', () => {
    expect(() =>
      validateRouteVoiceReportAudio({ bytes: Buffer.from('not-audio') }),
    ).toThrow(RouteVoiceReportAudioSignatureInvalidException)
  })

  it('accepts valid WebM', () => {
    const result = validateRouteVoiceReportAudio({
      bytes: webmFixture(),
      declaredMimeType: 'audio/webm;codecs=opus',
    })
    expect(result.mimeType).toBe('audio/webm')
    expect(result.extension).toBe('webm')
    expect(result.codec).toBe('opus')
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('accepts valid Ogg', () => {
    const result = validateRouteVoiceReportAudio({
      bytes: oggFixture(),
      declaredMimeType: 'audio/ogg;codecs=opus',
    })
    expect(result.mimeType).toBe('audio/ogg')
    expect(result.extension).toBe('ogg')
  })

  it('accepts MP4/M4A family when ftyp brand is allow-listed', () => {
    const result = validateRouteVoiceReportAudio({
      bytes: mp4Fixture(),
      declaredMimeType: 'audio/mp4',
    })
    expect(result.mimeType).toBe('audio/mp4')
    expect(result.extension).toBe('m4a')
  })

  it('rejects declared MIME incompatible with magic', () => {
    expect(() =>
      validateRouteVoiceReportAudio({
        bytes: webmFixture(),
        declaredMimeType: 'audio/mp4',
      }),
    ).toThrow(RouteVoiceReportAudioTypeUnsupportedException)
  })

  it('rejects duration below minimum', () => {
    expect(() => parseDurationSeconds('0.5')).toThrow(
      RouteVoiceReportDurationInvalidException,
    )
  })

  it('rejects duration above maximum', () => {
    expect(() => parseDurationSeconds('181')).toThrow(
      RouteVoiceReportDurationInvalidException,
    )
  })

  it('accepts duration within bounds', () => {
    expect(parseDurationSeconds('12.5')).toBe(12.5)
  })

  it('rejects malformed clientRecordedAt', () => {
    expect(() => parseClientRecordedAt('not-a-date')).toThrow(
      RouteVoiceReportTimestampInvalidException,
    )
  })

  it('rejects unreasonable future clientRecordedAt', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(() => parseClientRecordedAt(future)).toThrow(
      RouteVoiceReportTimestampInvalidException,
    )
  })

  it('accepts bounded locales', () => {
    expect(parseSelectedLocale('nl-NL')).toBe('nl-NL')
    expect(parseSelectedLocale('en-GB')).toBe('en-GB')
    expect(parseSelectedLocale('pl-PL')).toBe('pl-PL')
    expect(parseSelectedLocale('AUTO')).toBe('AUTO')
    expect(parseSelectedLocale(undefined)).toBeNull()
  })

  it('rejects invalid locale', () => {
    expect(() => parseSelectedLocale('!!!')).toThrow(
      RouteVoiceReportLocaleInvalidException,
    )
    expect(() => parseSelectedLocale('en-US')).toThrow(
      RouteVoiceReportLocaleInvalidException,
    )
  })

  it('rejects invalid clientUploadId', () => {
    expect(() => parseClientUploadId('short')).toThrow(
      RouteVoiceReportClientUploadIdInvalidException,
    )
  })

  it('builds opaque blob names without courier/pharmacy display names', () => {
    const routeId = '507f1f77bcf86cd799439011'
    const reportId = '507f1f77bcf86cd799439012'
    const blob = generateRouteVoiceReportBlobName({
      routeId,
      reportId,
      extension: 'webm',
    })
    expect(blob).toBe(
      `route-voice-reports/${routeId}/${reportId}/audio.webm`,
    )
    expect(blob.toLowerCase()).not.toContain('jan')
    expect(blob.toLowerCase()).not.toContain('apotheek')
    expect(blob.toLowerCase()).not.toContain('courier')
  })

  it('builds deterministic idempotency fingerprints', () => {
    const a = buildIdempotencyFingerprint({
      mimeType: 'audio/webm',
      sizeBytes: 100,
      durationSeconds: 10,
      sha256: 'abc',
      selectedLocale: 'nl-NL',
    })
    const b = buildIdempotencyFingerprint({
      mimeType: 'audio/webm',
      sizeBytes: 100,
      durationSeconds: 10,
      sha256: 'abc',
      selectedLocale: 'nl-NL',
    })
    const c = buildIdempotencyFingerprint({
      mimeType: 'audio/webm',
      sizeBytes: 101,
      durationSeconds: 10,
      sha256: 'abc',
      selectedLocale: 'nl-NL',
    })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
