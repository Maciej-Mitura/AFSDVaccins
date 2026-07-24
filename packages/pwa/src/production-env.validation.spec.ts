import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import {
  loadProductionPwaEnv,
  resolvePwaRootFromScriptUrl,
} from './config/load-production-pwa-env'
import { collectProductionEnvErrors } from './config/production-env-validation'

const pwaPackageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const monorepoRoot = join(pwaPackageRoot, '..', '..')
const validateScript = join(
  pwaPackageRoot,
  'scripts',
  'validate-production-env.mjs',
)

const REQUIRED_VITE_KEYS = [
  'VITE_BACKEND_URL',
  'VITE_BACKEND_WS_URL',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_E2E_AUTH_BYPASS',
] as const

const validFileContents = {
  VITE_BACKEND_URL: 'https://api.example.com/graphql',
  VITE_BACKEND_WS_URL: 'wss://api.example.com/graphql',
  VITE_FIREBASE_API_KEY: 'AIzaSyDemoKeyNotReal00000000000000000',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-app.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-app',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-app.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
  VITE_FIREBASE_APP_ID: '1:123456789012:web:abcdef',
}

const validEnv = { ...validFileContents }

const fixtureRoots: string[] = []
const savedViteEnv: Record<string, string | undefined> = {}
let viteEnvSnapshotted = false

function snapshotViteEnv(): void {
  for (const key of REQUIRED_VITE_KEYS) {
    savedViteEnv[key] = process.env[key]
    delete process.env[key]
  }
  viteEnvSnapshotted = true
}

function restoreViteEnv(): void {
  if (!viteEnvSnapshotted) {
    return
  }
  for (const key of REQUIRED_VITE_KEYS) {
    const value = savedViteEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  viteEnvSnapshotted = false
}

function createFixture(envFileName: string, values: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'pwa-prod-env-'))
  fixtureRoots.push(root)
  mkdirSync(join(root, 'scripts'), { recursive: true })
  const body = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  writeFileSync(join(root, envFileName), `${body}\n`, 'utf8')
  return root
}

function scriptUrlForFixture(fixtureRoot: string): string {
  return pathToFileURL(join(fixtureRoot, 'scripts', 'validate-production-env.mjs'))
    .href
}

function runValidateScript(cwd: string, env: NodeJS.ProcessEnv): {
  status: number | null
  stdout: string
  stderr: string
} {
  try {
    const stdout = execFileSync(
      process.execPath,
      ['--experimental-strip-types', validateScript],
      {
        cwd,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    return { status: 0, stdout, stderr: '' }
  } catch (error) {
    const err = error as {
      status?: number | null
      stdout?: string | Buffer
      stderr?: string | Buffer
    }
    return {
      status: err.status ?? 1,
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? ''),
    }
  }
}

/** Child env with host VITE_* cleared so only explicit overrides apply. */
function childEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of REQUIRED_VITE_KEYS) {
    delete env[key]
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }
  return env
}

afterEach(() => {
  restoreViteEnv()
  while (fixtureRoots.length > 0) {
    const root = fixtureRoots.pop()
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

describe('collectProductionEnvErrors', () => {
  it('accepts valid HTTPS/WSS production values', () => {
    expect(collectProductionEnvErrors(validEnv)).toEqual([])
  })

  it('rejects missing required variables', () => {
    const errors = collectProductionEnvErrors({})
    expect(errors.some(e => e.includes('VITE_BACKEND_URL'))).toBe(true)
    expect(errors.some(e => e.includes('VITE_BACKEND_WS_URL'))).toBe(true)
    expect(errors.some(e => e.includes('VITE_FIREBASE_API_KEY'))).toBe(true)
  })

  it('rejects http and ws URLs', () => {
    const errors = collectProductionEnvErrors({
      ...validEnv,
      VITE_BACKEND_URL: 'http://api.example.com/graphql',
      VITE_BACKEND_WS_URL: 'ws://api.example.com/graphql',
    })
    expect(errors.some(e => e.includes('https://'))).toBe(true)
    expect(errors.some(e => e.includes('wss://'))).toBe(true)
  })

  it('rejects localhost HTTP/WS development endpoints', () => {
    const errors = collectProductionEnvErrors({
      ...validEnv,
      VITE_BACKEND_URL: 'http://localhost:3000/graphql',
      VITE_BACKEND_WS_URL: 'ws://localhost:3000/graphql',
    })
    expect(errors.some(e => e.includes('https://'))).toBe(true)
    expect(errors.some(e => e.includes('wss://'))).toBe(true)
  })

  it('rejects replace-me placeholders', () => {
    const errors = collectProductionEnvErrors({
      ...validEnv,
      VITE_FIREBASE_PROJECT_ID: 'replace-me',
    })
    expect(errors.some(e => e.includes('VITE_FIREBASE_PROJECT_ID'))).toBe(true)
  })

  it('rejects E2E auth bypass', () => {
    const errors = collectProductionEnvErrors({
      ...validEnv,
      VITE_E2E_AUTH_BYPASS: 'true',
    })
    expect(errors.some(e => e.includes('VITE_E2E_AUTH_BYPASS'))).toBe(true)
  })

  it('never includes secret values in error messages', () => {
    const secret = 'super-secret-api-key-xyz-never-print-me'
    const errors = collectProductionEnvErrors({
      ...validEnv,
      VITE_FIREBASE_API_KEY: secret,
      VITE_BACKEND_URL: 'http://bad.example/graphql',
    })
    const joined = errors.join('\n')
    expect(joined).not.toContain(secret)
    expect(joined).not.toContain('http://bad.example/graphql')
  })
})

describe('loadProductionPwaEnv (Vite loadEnv)', () => {
  it('discovers .env.production.local values from the PWA directory', () => {
    snapshotViteEnv()
    const fixture = createFixture(
      '.env.production.local',
      validFileContents,
    )
    const env = loadProductionPwaEnv(fixture)
    expect(collectProductionEnvErrors(env)).toEqual([])
    expect(env.VITE_BACKEND_URL).toBe(validFileContents.VITE_BACKEND_URL)
  })

  it('loads from script-relative PWA root when cwd is the monorepo root', () => {
    snapshotViteEnv()
    const fixture = createFixture(
      '.env.production.local',
      validFileContents,
    )
    const originalCwd = process.cwd()
    process.chdir(monorepoRoot)
    try {
      const pwaRoot = resolvePwaRootFromScriptUrl(scriptUrlForFixture(fixture))
      expect(collectProductionEnvErrors(loadProductionPwaEnv(pwaRoot))).toEqual(
        [],
      )
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('loads from script-relative PWA root when cwd is packages/pwa', () => {
    snapshotViteEnv()
    const fixture = createFixture(
      '.env.production.local',
      validFileContents,
    )
    const originalCwd = process.cwd()
    process.chdir(pwaPackageRoot)
    try {
      const pwaRoot = resolvePwaRootFromScriptUrl(scriptUrlForFixture(fixture))
      expect(collectProductionEnvErrors(loadProductionPwaEnv(pwaRoot))).toEqual(
        [],
      )
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('lets explicit process.env values override file values', () => {
    snapshotViteEnv()
    const fixture = createFixture('.env.production.local', {
      ...validFileContents,
      VITE_FIREBASE_PROJECT_ID: 'from-file',
    })
    process.env.VITE_FIREBASE_PROJECT_ID = 'from-process'
    const env = loadProductionPwaEnv(fixture)
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe('from-process')
  })

  it('does not load development-mode env files for production mode', () => {
    snapshotViteEnv()
    const fixture = createFixture('.env.development.local', {
      VITE_BACKEND_URL: 'http://localhost:3000/graphql',
      VITE_BACKEND_WS_URL: 'ws://localhost:3000/graphql',
      VITE_FIREBASE_API_KEY: 'dev-only-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'dev.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'dev-only',
      VITE_FIREBASE_STORAGE_BUCKET: 'dev.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
      VITE_FIREBASE_APP_ID: '1:0:web:dev',
    })
    writeFileSync(
      join(fixture, '.env.production.local'),
      Object.entries(validFileContents)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n',
      'utf8',
    )
    const env = loadProductionPwaEnv(fixture)
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe('demo-app')
    expect(env.VITE_FIREBASE_API_KEY).not.toBe('dev-only-key')
    expect(collectProductionEnvErrors(env)).toEqual([])
  })

  it('still fails when required variables are missing from files and process.env', () => {
    snapshotViteEnv()
    const fixture = createFixture('.env.production.local', {
      VITE_BACKEND_URL: 'https://api.example.com/graphql',
    })
    const errors = collectProductionEnvErrors(loadProductionPwaEnv(fixture))
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.includes('VITE_BACKEND_WS_URL'))).toBe(true)
  })
})

describe('validate-production-env.mjs CLI', () => {
  it('works when launched from the monorepo root with explicit process.env', () => {
    const secret = 'cli-secret-from-root-never-print'
    const result = runValidateScript(
      monorepoRoot,
      childEnv({ ...validFileContents, VITE_FIREBASE_API_KEY: secret }),
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('validation passed')
    expect(result.stdout + result.stderr).not.toContain(secret)
  })

  it('works when launched from packages/pwa with explicit process.env', () => {
    const secret = 'cli-secret-from-pwa-never-print'
    const result = runValidateScript(
      pwaPackageRoot,
      childEnv({ ...validFileContents, VITE_FIREBASE_API_KEY: secret }),
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('validation passed')
    expect(result.stdout + result.stderr).not.toContain(secret)
  })

  it('fails for HTTP/ws process.env values without printing secrets', () => {
    const secret = 'cli-http-secret-never-print'
    const result = runValidateScript(
      monorepoRoot,
      childEnv({
        ...validFileContents,
        VITE_FIREBASE_API_KEY: secret,
        VITE_BACKEND_URL: 'http://api.example.com/graphql',
        VITE_BACKEND_WS_URL: 'ws://api.example.com/graphql',
      }),
    )
    expect(result.status).not.toBe(0)
    const output = result.stdout + result.stderr
    expect(output).toContain('validation failed')
    expect(output).not.toContain(secret)
    expect(output).not.toContain('http://api.example.com/graphql')
  })

  it('fails when VITE_E2E_AUTH_BYPASS=true', () => {
    const result = runValidateScript(
      monorepoRoot,
      childEnv({ ...validFileContents, VITE_E2E_AUTH_BYPASS: 'true' }),
    )
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('VITE_E2E_AUTH_BYPASS')
  })

  it('fails for placeholder Firebase values', () => {
    const result = runValidateScript(
      monorepoRoot,
      childEnv({
        ...validFileContents,
        VITE_FIREBASE_PROJECT_ID: 'replace-me',
      }),
    )
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('VITE_FIREBASE_PROJECT_ID')
  })

  it('resolves PWA root from import.meta.url rather than cwd alone', () => {
    const script = readFileSync(validateScript, 'utf8')
    const code = script
      .split('\n')
      .filter(line => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n')
    expect(script).toContain('resolvePwaRootFromScriptUrl')
    expect(script).toContain('import.meta.url')
    expect(script).toContain('loadProductionPwaEnv')
    expect(code).not.toMatch(/process\.cwd\s*\(/)
  })
})

describe('production env file gitignore', () => {
  it('keeps packages/pwa/.env.production.local ignored by Git', () => {
    const output = execFileSync(
      'git',
      ['check-ignore', '-v', 'packages/pwa/.env.production.local'],
      { cwd: monorepoRoot, encoding: 'utf8' },
    )
    expect(output).toMatch(/\.env/)
  })
})
