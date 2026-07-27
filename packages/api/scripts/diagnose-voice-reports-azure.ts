/**
 * Phase 34D CLI: safe Azure voice-report configuration diagnostics.
 * Usage: npm run diagnose:voice-reports:azure
 *
 * Loads packages/api/.env (does not override existing process.env).
 * Never prints keys, connection strings, or SAS values.
 * Does not start NestJS. Does not contact Azure.
 */
import { resolve } from 'node:path'

import {
  assertNoSecretsInDiagnosticOutput,
  diagnoseVoiceReportsAzure,
  loadApiEnvFile,
  validateApiEnvFromProcess,
} from '../src/routes/voice-report/voice-report-azure-diagnostics'

function main(): void {
  const apiRoot = resolve(__dirname, '..')
  const loaded = loadApiEnvFile(apiRoot)
  if (!loaded.loaded) {
    console.error(`No .env found at ${loaded.path} (continuing with process.env)`)
  }

  const validated = validateApiEnvFromProcess()
  if (!validated.ok || !validated.value) {
    console.error('API configuration validation failed:')
    for (const issue of validated.issues) {
      console.error(`- ${issue}`)
    }
    process.exitCode = 1
    return
  }

  const report = diagnoseVoiceReportsAzure(validated.value)
  const output = [...report.lines]
  if (report.issues.length > 0) {
    output.push('Issues:')
    for (const issue of report.issues) {
      output.push(`- ${issue}`)
    }
  } else {
    output.push('Diagnostics: configuration looks complete for selected providers')
  }

  const text = output.join('\n')
  assertNoSecretsInDiagnosticOutput(text)
  console.log(text)

  if (!report.ok) {
    process.exitCode = 1
  }
}

try {
  main()
} catch (error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Diagnostic command failed'
  console.error(message)
  process.exitCode = 1
}
