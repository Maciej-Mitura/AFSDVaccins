/**
 * Phase 34D CLI: Azure Speech acceptance for route voice reports.
 * Usage:
 *   npm run test:voice-reports:azure-speech -- --audio <path> [--locale nl-NL]
 *
 * Contacts real Azure Speech. Prints the test transcript (developer command only).
 * Never uploads audio to Blob Storage. Never creates Mongo records.
 */
import { resolve } from 'node:path'

import {
  parseSpeechAcceptanceLocale,
  runVoiceReportAzureSpeechAcceptance,
} from '../src/routes/voice-report/azure-route-voice-speech-acceptance'
import {
  diagnoseVoiceReportsAzure,
  loadApiEnvFile,
  redactDiagnosticMessage,
  validateApiEnvFromProcess,
} from '../src/routes/voice-report/voice-report-azure-diagnostics'

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index < 0 || index + 1 >= process.argv.length) {
    return undefined
  }
  return process.argv[index + 1]
}

async function main(): Promise<void> {
  const audioPath = readArg('--audio')
  if (!audioPath) {
    console.error(
      'Usage: npm run test:voice-reports:azure-speech -- --audio <path> [--locale nl-NL|en-GB|pl-PL|AUTO]',
    )
    process.exitCode = 1
    return
  }

  const apiRoot = resolve(__dirname, '..')
  loadApiEnvFile(apiRoot)

  const validated = validateApiEnvFromProcess()
  if (!validated.ok || !validated.value) {
    console.error('API configuration validation failed:')
    for (const issue of validated.issues) {
      console.error(`- ${issue}`)
    }
    process.exitCode = 1
    return
  }

  const env = validated.value
  if (env.ROUTE_VOICE_TRANSCRIPTION_PROVIDER !== 'azure') {
    console.error(
      'Speech acceptance requires ROUTE_VOICE_TRANSCRIPTION_PROVIDER=azure',
    )
    process.exitCode = 1
    return
  }

  const diagnostic = diagnoseVoiceReportsAzure(env)
  if (!diagnostic.speechEndpointConfigured || !diagnostic.speechKeyConfigured) {
    console.error('Azure Speech endpoint/key incomplete')
    process.exitCode = 1
    return
  }

  const locale = parseSpeechAcceptanceLocale(readArg('--locale'))
  console.log(
    'Running Azure Speech acceptance (paid network call; local audio only)...',
  )

  try {
    const result = await runVoiceReportAzureSpeechAcceptance({
      endpoint: env.AZURE_SPEECH_ENDPOINT!,
      key: env.AZURE_SPEECH_KEY!,
      timeoutMs: env.ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS,
      audioPath,
      locale,
    })
    console.log('Azure Speech acceptance: SUCCESS')
    console.log(`Detected locale: ${result.detectedLocale ?? '(none)'}`)
    console.log(
      `Confidence: ${result.confidence === null ? '(none)' : result.confidence}`,
    )
    console.log(
      `Azure duration seconds: ${
        result.audioDurationSeconds === null
          ? '(none)'
          : result.audioDurationSeconds
      }`,
    )
    console.log(`Provider request id: ${result.providerRequestId ?? '(none)'}`)
    console.log(`Elapsed ms: ${result.elapsedMs}`)
    console.log(`Transcript: ${result.transcript}`)
  } catch (error) {
    const message =
      error instanceof Error
        ? redactDiagnosticMessage(error.message)
        : 'Azure Speech acceptance failed'
    console.error(`Azure Speech acceptance: FAILED (${message})`)
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? redactDiagnosticMessage(error.message)
      : 'Azure Speech acceptance failed'
  console.error(message)
  process.exitCode = 1
})
