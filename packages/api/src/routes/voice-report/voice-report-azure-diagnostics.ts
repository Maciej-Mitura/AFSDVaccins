import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'

import {
  EnvConfig,
  envValidationSchema,
} from '../../config/env.validation'
import {
  AZURE_SPEECH_FAST_TRANSCRIBE_API_VERSION,
  ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY_DEFAULT,
  ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS_DEFAULT,
  ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS_DEFAULT,
  ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS_DEFAULT,
} from './route-voice-transcription.constants'
import { ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME } from './route-voice-report.constants'
import { safeAzureSpeechEndpointHost } from './azure-route-voice-transcription.provider'

export type VoiceReportAzureDiagnosticReport = {
  ok: boolean
  nodeEnv: string
  storageProvider: string
  transcriptionProvider: string
  transcriptionEnabled: boolean
  speechEndpointConfigured: boolean
  speechEndpointHost: string | null
  speechApiVersion: string
  speechKeyConfigured: boolean
  storageConnectionConfigured: boolean
  voiceReportContainer: string
  timeoutMs: number
  concurrency: number
  maxAttempts: number
  leaseSeconds: number
  issues: string[]
  lines: string[]
}

/**
 * Load packages/api/.env into process.env without overriding already-set vars.
 * Never prints file contents.
 */
export function loadApiEnvFile(apiRoot = resolve(process.cwd())): {
  loaded: boolean
  path: string
} {
  const envPath = resolve(apiRoot, '.env')
  if (!existsSync(envPath)) {
    return { loaded: false, path: envPath }
  }
  loadDotenv({ path: envPath, override: false })
  return { loaded: true, path: envPath }
}

/**
 * Validate current process.env with the normal Nest Joi schema.
 * Returns validated config or structured issues (never secrets).
 */
export function validateApiEnvFromProcess(): {
  ok: boolean
  value?: EnvConfig
  issues: string[]
} {
  const result = envValidationSchema.validate(process.env, {
    abortEarly: false,
    convert: true,
    allowUnknown: true,
  })
  if (result.error) {
    return {
      ok: false,
      issues: result.error.details.map(detail =>
        redactDiagnosticMessage(detail.message),
      ),
    }
  }
  return { ok: true, value: result.value as EnvConfig, issues: [] }
}

export function diagnoseVoiceReportsAzure(
  env: EnvConfig,
): VoiceReportAzureDiagnosticReport {
  const issues: string[] = []
  const storageProvider = env.VACCINE_IMAGE_STORAGE_PROVIDER
  const transcriptionProvider = env.ROUTE_VOICE_TRANSCRIPTION_PROVIDER
  const transcriptionEnabled = env.ROUTE_VOICE_TRANSCRIPTION_ENABLED
  const speechEndpoint = env.AZURE_SPEECH_ENDPOINT?.trim() ?? ''
  const speechKey = env.AZURE_SPEECH_KEY?.trim() ?? ''
  const storageConnection = env.AZURE_STORAGE_CONNECTION_STRING?.trim() ?? ''
  const voiceReportContainer =
    env.AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER ||
    ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME
  const timeoutMs =
    env.ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS ??
    ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS_DEFAULT
  const concurrency =
    env.ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY ??
    ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY_DEFAULT
  const maxAttempts =
    env.ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS ??
    ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS_DEFAULT
  const leaseSeconds =
    env.ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS ??
    ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS_DEFAULT

  const speechEndpointHost =
    speechEndpoint.length > 0
      ? safeAzureSpeechEndpointHost(speechEndpoint)
      : null

  const azureModeSelected =
    storageProvider === 'azure' || transcriptionProvider === 'azure'

  if (env.NODE_ENV === 'production') {
    if (storageProvider !== 'azure') {
      issues.push('Production requires VACCINE_IMAGE_STORAGE_PROVIDER=azure')
    }
    if (transcriptionProvider !== 'azure') {
      issues.push('Production requires ROUTE_VOICE_TRANSCRIPTION_PROVIDER=azure')
    }
    if (!transcriptionEnabled) {
      issues.push('Production requires ROUTE_VOICE_TRANSCRIPTION_ENABLED=true')
    }
  }

  if (storageProvider === 'azure' && storageConnection.length === 0) {
    issues.push('AZURE_STORAGE_CONNECTION_STRING is required for azure storage')
  }
  if (transcriptionProvider === 'azure') {
    if (!speechEndpointHost) {
      issues.push('AZURE_SPEECH_ENDPOINT is missing or invalid')
    }
    if (speechKey.length === 0) {
      issues.push('AZURE_SPEECH_KEY is required for azure transcription')
    }
  }

  const lines = [
    `NODE_ENV: ${env.NODE_ENV}`,
    `Storage provider: ${storageProvider}`,
    `Transcription provider: ${transcriptionProvider}`,
    `Transcription enabled: ${transcriptionEnabled}`,
    speechEndpointHost
      ? `Azure Speech endpoint: configured (host: ${speechEndpointHost})`
      : 'Azure Speech endpoint: not configured',
    `Azure Speech API version: ${AZURE_SPEECH_FAST_TRANSCRIBE_API_VERSION}`,
    speechKey.length > 0
      ? 'Azure Speech key: configured'
      : 'Azure Speech key: not configured',
    storageConnection.length > 0
      ? 'Azure Storage connection: configured'
      : 'Azure Storage connection: not configured',
    `Voice-report container: ${voiceReportContainer}`,
    `Transcription timeout ms: ${timeoutMs}`,
    `Transcription concurrency: ${concurrency}`,
    `Transcription max attempts: ${maxAttempts}`,
    `Transcription lease seconds: ${leaseSeconds}`,
  ]

  const incompleteAzure =
    azureModeSelected &&
    (issues.length > 0 ||
      (storageProvider === 'azure' && storageConnection.length === 0) ||
      (transcriptionProvider === 'azure' &&
        (speechKey.length === 0 || !speechEndpointHost)))

  return {
    ok: !incompleteAzure && issues.length === 0,
    nodeEnv: env.NODE_ENV,
    storageProvider,
    transcriptionProvider,
    transcriptionEnabled,
    speechEndpointConfigured: Boolean(speechEndpointHost),
    speechEndpointHost,
    speechApiVersion: AZURE_SPEECH_FAST_TRANSCRIBE_API_VERSION,
    speechKeyConfigured: speechKey.length > 0,
    storageConnectionConfigured: storageConnection.length > 0,
    voiceReportContainer,
    timeoutMs,
    concurrency,
    maxAttempts,
    leaseSeconds,
    issues,
    lines,
  }
}

/** Strip accidental secret-shaped substrings from Joi / Error messages. */
export function redactDiagnosticMessage(message: string): string {
  return message
    .replace(/AccountKey=[^;\s]+/gi, 'AccountKey=[REDACTED]')
    .replace(/SharedAccessSignature=[^;\s]+/gi, 'SharedAccessSignature=[REDACTED]')
    .replace(
      /DefaultEndpointsProtocol=[^\n]+/gi,
      'DefaultEndpointsProtocol=[REDACTED_CONNECTION]',
    )
    .replace(/Ocp-Apim-Subscription-Key:\s*\S+/gi, 'Ocp-Apim-Subscription-Key: [REDACTED]')
}

export function assertNoSecretsInDiagnosticOutput(text: string): void {
  const forbidden = [
    /AccountKey=/i,
    /SharedAccessSignature=/i,
    /Ocp-Apim-Subscription-Key:\s*(?!\[REDACTED\])\S+/i,
  ]
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      throw new Error('Diagnostic output unexpectedly contained a secret pattern')
    }
  }
}

/** Read a local file for speech acceptance without logging contents. */
export function readLocalAudioFile(path: string): Buffer {
  const absolute = resolve(path)
  if (!existsSync(absolute)) {
    throw new Error(`Audio file not found: ${absolute}`)
  }
  return readFileSync(absolute)
}
