/**
 * Phase 34D CLI: Azure Blob Storage acceptance for route voice reports.
 * Usage: npm run test:voice-reports:azure-storage [-- --create-container]
 *
 * Contacts real Azure when credentials are configured. Never prints secrets.
 * Never creates Mongo / route-report records.
 */
import { resolve } from 'node:path'

import { runVoiceReportAzureStorageAcceptance } from '../src/routes/voice-report/azure-route-voice-report-acceptance'
import {
  diagnoseVoiceReportsAzure,
  loadApiEnvFile,
  redactDiagnosticMessage,
  validateApiEnvFromProcess,
} from '../src/routes/voice-report/voice-report-azure-diagnostics'

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

async function main(): Promise<void> {
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
  const diagnostic = diagnoseVoiceReportsAzure(env)
  if (env.VACCINE_IMAGE_STORAGE_PROVIDER !== 'azure') {
    console.error(
      'Blob acceptance requires VACCINE_IMAGE_STORAGE_PROVIDER=azure',
    )
    process.exitCode = 1
    return
  }
  if (!diagnostic.storageConnectionConfigured) {
    console.error('AZURE_STORAGE_CONNECTION_STRING is not configured')
    process.exitCode = 1
    return
  }

  console.log(
    'Running Azure Blob acceptance (network call; temporary probe object)...',
  )
  try {
    const result = await runVoiceReportAzureStorageAcceptance({
      connectionString: env.AZURE_STORAGE_CONNECTION_STRING!,
      containerName: env.AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER,
      createContainer: hasFlag('--create-container'),
    })
    console.log('Azure Blob acceptance: SUCCESS')
    console.log(`Container: ${result.containerName}`)
    console.log('Private access: verified')
    console.log(`Probe blob cleaned up: ${result.cleanedUp}`)
    console.log(`SHA-256 verified: ${result.sha256.slice(0, 12)}…`)
    console.log('Range download: verified')
  } catch (error) {
    const message =
      error instanceof Error
        ? redactDiagnosticMessage(error.message)
        : 'Azure Blob acceptance failed'
    console.error(`Azure Blob acceptance: FAILED (${message})`)
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? redactDiagnosticMessage(error.message)
      : 'Azure Blob acceptance failed'
  console.error(message)
  process.exitCode = 1
})
