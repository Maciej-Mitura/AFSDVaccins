import {
  assertValidAcceptanceProbeBlobName,
  buildAcceptanceProbeBlobName,
} from './azure-route-voice-report-acceptance'
import {
  assertNoSecretsInDiagnosticOutput,
  diagnoseVoiceReportsAzure,
  redactDiagnosticMessage,
} from './voice-report-azure-diagnostics'
import type { EnvConfig } from '../../config/env.validation'
import { RouteVoiceReportStorageFailedException } from './route-voice-report.exceptions'

function baseEnv(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    NODE_ENV: 'development',
    PORT: 3000,
    URL_FRONTEND: 'http://localhost:5173',
    DB_HOST: 'mongodb://localhost:27017',
    DB_NAME: 'vaccin-delivery',
    TRUST_PROXY: false,
    ALLOW_DATABASE_SEED: false,
    ALLOW_DATABASE_BOOTSTRAP: false,
    ALLOW_E2E_AUTH_BYPASS: false,
    THROTTLE_DEFAULT_TTL_MS: 60_000,
    THROTTLE_DEFAULT_LIMIT: 120,
    THROTTLE_STRICT_TTL_MS: 60_000,
    THROTTLE_STRICT_LIMIT: 20,
    CACHE_DEFAULT_TTL_MS: 30_000,
    CACHE_REFERENCE_TTL_MS: 60_000,
    GRAPHQL_MAX_DEPTH: 12,
    GRAPHQL_MAX_COMPLEXITY: 500,
    API_JSON_BODY_LIMIT: '1mb',
    VACCINE_IMAGE_ANALYSIS_PROVIDER: 'fake',
    VACCINE_IMAGE_STORAGE_PROVIDER: 'fake',
    AZURE_STORAGE_READ_URL_TTL_SECONDS: 900,
    AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER: 'route-voice-reports',
    AZURE_VISION_TIMEOUT_MS: 10_000,
    ROUTE_VOICE_TRANSCRIPTION_ENABLED: true,
    ROUTE_VOICE_TRANSCRIPTION_PROVIDER: 'fake',
    ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS: 60_000,
    ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY: 1,
    ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS: 3,
    ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS: 600,
    ROUTE_VOICE_TRANSCRIPTION_RECOVERY_BATCH_SIZE: 25,
    PUSH_PROVIDER: 'fake',
    ...overrides,
  }
}

describe('Phase 34D Azure diagnostics and acceptance helpers', () => {
  it('prints only safe configuration lines', () => {
    const report = diagnoseVoiceReportsAzure(
      baseEnv({
        VACCINE_IMAGE_STORAGE_PROVIDER: 'azure',
        ROUTE_VOICE_TRANSCRIPTION_PROVIDER: 'azure',
        AZURE_STORAGE_CONNECTION_STRING:
          'DefaultEndpointsProtocol=https;AccountName=example;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net',
        AZURE_SPEECH_ENDPOINT: 'https://example.cognitiveservices.azure.com/',
        AZURE_SPEECH_KEY: 'super-secret-key',
      }),
    )
    const text = report.lines.join('\n')
    expect(text).toContain('host: example.cognitiveservices.azure.com')
    expect(text).toContain('Azure Speech key: configured')
    expect(text).toContain('Azure Storage connection: configured')
    expect(text).not.toContain('super-secret-key')
    expect(text).not.toContain('AccountKey=')
    expect(text).not.toContain('dGVzdA==')
    assertNoSecretsInDiagnosticOutput(text)
    expect(report.ok).toBe(true)
  })

  it('exits incomplete when azure mode lacks settings', () => {
    const report = diagnoseVoiceReportsAzure(
      baseEnv({
        VACCINE_IMAGE_STORAGE_PROVIDER: 'azure',
        ROUTE_VOICE_TRANSCRIPTION_PROVIDER: 'azure',
      }),
    )
    expect(report.ok).toBe(false)
    expect(report.issues.length).toBeGreaterThan(0)
  })

  it('redacts connection-string shaped fragments', () => {
    const redacted = redactDiagnosticMessage(
      'boom AccountKey=abc123;SharedAccessSignature=sig',
    )
    expect(redacted).toContain('[REDACTED]')
    expect(redacted).not.toContain('abc123')
  })

  it('accepts only dedicated acceptance probe blob names', () => {
    const name = buildAcceptanceProbeBlobName(
      '11111111-1111-4111-8111-111111111111',
    )
    expect(assertValidAcceptanceProbeBlobName(name)).toBe(name)
    expect(() =>
      assertValidAcceptanceProbeBlobName(
        'route-voice-reports/aaaaaaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbb/audio.webm',
      ),
    ).toThrow(RouteVoiceReportStorageFailedException)
  })
})
