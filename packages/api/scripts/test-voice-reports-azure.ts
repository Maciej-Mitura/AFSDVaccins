/**
 * Phase 34D CLI: combined Azure voice-report infrastructure verification.
 * Usage:
 *   npm run test:voice-reports:azure
 *   npm run test:voice-reports:azure -- --audio ./sample.webm --locale nl-NL
 *   npm run test:voice-reports:azure -- --create-container
 *
 * Runs diagnostics + Blob acceptance; Speech acceptance only when --audio is set.
 * Does not start NestJS. Never prints secrets.
 */
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index < 0 || index + 1 >= process.argv.length) {
    return undefined
  }
  return process.argv[index + 1]
}

function runScript(script: string, extraArgs: string[]): number {
  const result = spawnSync(
    process.execPath,
    [
      '-r',
      'ts-node/register/transpile-only',
      resolve(__dirname, script),
      ...extraArgs,
    ],
    {
      cwd: resolve(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    },
  )
  if (result.error) {
    console.error(result.error.message)
    return 1
  }
  return result.status ?? 1
}

function main(): void {
  const diagnoseCode = runScript('diagnose-voice-reports-azure.ts', [])
  if (diagnoseCode !== 0) {
    process.exitCode = diagnoseCode
    return
  }

  const storageArgs = hasFlag('--create-container')
    ? ['--create-container']
    : []
  const storageCode = runScript(
    'test-voice-reports-azure-storage.ts',
    storageArgs,
  )
  if (storageCode !== 0) {
    process.exitCode = storageCode
    return
  }

  const audio = readArg('--audio')
  if (!audio) {
    console.log(
      'Speech acceptance skipped (pass --audio <path> to include Azure Speech).',
    )
    process.exitCode = 0
    return
  }

  const speechArgs = ['--audio', audio]
  const locale = readArg('--locale')
  if (locale) {
    speechArgs.push('--locale', locale)
  }
  process.exitCode = runScript('test-voice-reports-azure-speech.ts', speechArgs)
}

main()
