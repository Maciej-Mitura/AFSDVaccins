/**
 * Optional real-Azure integration tests (Phase 34D).
 *
 * SKIPPED by default — never contacts Azure from normal `npm run test:api`.
 *
 * Enable explicitly (cost / network warning):
 *   AZURE_VOICE_REPORT_INTEGRATION_TESTS=true
 *   + real AZURE_STORAGE_* / AZURE_SPEECH_* in the environment
 *   + optional AZURE_VOICE_REPORT_TEST_AUDIO for Speech
 *
 * Do not commit credentials or copyrighted/personal audio.
 */
import { runVoiceReportAzureStorageAcceptance } from './azure-route-voice-report-acceptance'
import { runVoiceReportAzureSpeechAcceptance } from './azure-route-voice-speech-acceptance'
import { RouteVoiceTranscriptionLocale } from './route-voice-transcription-locale.enum'

const enabled = process.env.AZURE_VOICE_REPORT_INTEGRATION_TESTS === 'true'

const describeIntegration = enabled ? describe : describe.skip

describeIntegration('Azure voice-report integration (opt-in)', () => {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ?? ''
  const containerName =
    process.env.AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER ??
    'route-voice-reports'
  const speechEndpoint = process.env.AZURE_SPEECH_ENDPOINT ?? ''
  const speechKey = process.env.AZURE_SPEECH_KEY ?? ''
  const audioPath = process.env.AZURE_VOICE_REPORT_TEST_AUDIO ?? ''

  it('uploads, downloads, ranges, and deletes a temporary Blob probe', async () => {
    expect(connectionString.length).toBeGreaterThan(0)
    const result = await runVoiceReportAzureStorageAcceptance({
      connectionString,
      containerName,
      createContainer: process.env.AZURE_VOICE_REPORT_CREATE_CONTAINER === 'true',
    })
    expect(result.ok).toBe(true)
    expect(result.cleanedUp).toBe(true)
    expect(result.privateAccess).toBe(true)
  })

  it('transcribes a supplied local audio file when configured', async () => {
    if (!audioPath) {
      console.warn(
        'Skipping Speech integration: set AZURE_VOICE_REPORT_TEST_AUDIO',
      )
      return
    }
    expect(speechEndpoint.length).toBeGreaterThan(0)
    expect(speechKey.length).toBeGreaterThan(0)
    const result = await runVoiceReportAzureSpeechAcceptance({
      endpoint: speechEndpoint,
      key: speechKey,
      timeoutMs: 60_000,
      audioPath,
      locale: RouteVoiceTranscriptionLocale.AUTO,
    })
    expect(result.ok).toBe(true)
    expect(result.transcript.length).toBeGreaterThan(0)
  })
})
