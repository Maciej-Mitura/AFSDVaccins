import { MODULE_METADATA } from '@nestjs/common/constants'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { AuthenticationModule } from '../authentication/authentication.module'
import { DATABASE_RESET_CONFIRMATION_PHRASE } from '../config/env.validation'
import { SeedModule } from './seed.module'
import { DatabaseResetAppModule } from './database-reset-app.module'
import { DatabaseResetService } from './database-reset.service'
import { DatabaseResetSafetyService } from './database-reset.safety'

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
