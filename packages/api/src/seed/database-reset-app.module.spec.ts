import { MODULE_METADATA } from '@nestjs/common/constants'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { AuthenticationModule } from '../authentication/authentication.module'
import { DATABASE_RESET_CONFIRMATION_PHRASE } from '../config/env.validation'
import { SeedModule } from './seed.module'
import { DatabaseResetService } from './database-reset.service'
import { DatabaseResetSafetyService } from './database-reset.safety'

/**
 * DatabaseResetAppModule calls ConfigModule.forRoot at import time. Locally a
 * packages/api/.env may satisfy validation; CI has no .env, so set minimal env
 * before requiring the module (same pattern as bootstrap-app.compilation.spec).
 */
function loadDatabaseResetAppModule(): new () => unknown {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'
  process.env.PORT = process.env.PORT ?? '3000'
  process.env.URL_FRONTEND =
    process.env.URL_FRONTEND ?? 'http://localhost:5173'
  process.env.DB_HOST = process.env.DB_HOST ?? 'mongodb://localhost:27017'
  process.env.DB_NAME = process.env.DB_NAME ?? 'vaccin-delivery'

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseResetAppModule } = require('./database-reset-app.module') as {
    DatabaseResetAppModule: new () => unknown
  }
  return DatabaseResetAppModule
}

function moduleImports(
  metatype: abstract new (...args: never[]) => unknown,
): unknown[] {
  return (
    (Reflect.getMetadata(MODULE_METADATA.IMPORTS, metatype) as unknown[]) ?? []
  )
}

function moduleProviders(
  metatype: abstract new (...args: never[]) => unknown,
): unknown[] {
  return (
    (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, metatype) as unknown[]) ??
    []
  )
}

describe('DatabaseResetAppModule', () => {
  const DatabaseResetAppModule = loadDatabaseResetAppModule()

  it('does not import Firebase, seed, or TypeORM modules', () => {
    const imports = moduleImports(DatabaseResetAppModule)
    expect(imports).not.toContain(AuthenticationModule)
    expect(imports).not.toContain(SeedModule)

    const source = readFileSync(
      join(__dirname, 'database-reset-app.module.ts'),
      'utf8',
    )
    expect(source).not.toContain('TypeOrmModule')
    expect(source).not.toMatch(/firebase-admin/)
    expect(source).not.toContain('AuthenticationModule')
    expect(source).not.toContain('SeedService')
  })

  it('provides the reset safety and reset services', () => {
    const providers = moduleProviders(DatabaseResetAppModule)
    expect(providers).toContain(DatabaseResetSafetyService)
    expect(providers).toContain(DatabaseResetService)
  })

  it('keeps the local reset confirmation phrase and CLI ordering', () => {
    expect(DATABASE_RESET_CONFIRMATION_PHRASE).toBe(
      'RESET_LOCAL_DEMO_DATABASE',
    )

    const cli = readFileSync(join(__dirname, '..', 'reset-cli.ts'), 'utf8')
    const contextIdx = cli.indexOf('createApplicationContext')
    const runIdx = cli.indexOf('await resetService.run()')
    expect(contextIdx).toBeGreaterThan(-1)
    expect(runIdx).toBeGreaterThan(contextIdx)
    expect(cli).toContain('Does not touch Firebase Authentication')
  })
})
