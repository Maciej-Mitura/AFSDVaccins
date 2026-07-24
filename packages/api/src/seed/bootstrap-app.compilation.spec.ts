import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { FirebaseService } from '../authentication/firebase.service'
import { StrictIdentityThrottlerGuard } from '../common/throttling/strict-identity-throttler.guard'
import { DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE } from '../config/env.validation'
import { SeedService } from './seed.service'

/**
 * Boots BootstrapAppModule against an in-memory MongoDB (not Atlas) with
 * Firebase init skipped via NODE_ENV=test. Proves the CLI graph resolves
 * without THROTTLER:MODULE_OPTIONS / StrictIdentityThrottlerGuard.
 *
 * BootstrapAppModule is imported dynamically after env is set because its
 * ConfigModule.forRoot validates process.env at import time.
 */
describe('BootstrapAppModule compilation (memory Mongo)', () => {
  let mongo: MongoMemoryServer
  let BootstrapAppModule: new () => unknown
  const envKeys = [
    'NODE_ENV',
    'PORT',
    'URL_FRONTEND',
    'DB_HOST',
    'DB_NAME',
    'ALLOW_DATABASE_BOOTSTRAP',
    'CONFIRM_DATABASE_BOOTSTRAP',
  ] as const
  const previousEnv: Partial<
    Record<(typeof envKeys)[number], string | undefined>
  > = {}

  beforeAll(async () => {
    for (const key of envKeys) {
      previousEnv[key] = process.env[key]
    }

    mongo = await MongoMemoryServer.create()
    process.env.NODE_ENV = 'test'
    process.env.PORT = '3000'
    process.env.URL_FRONTEND = 'http://localhost:5173'
    process.env.DB_HOST = mongo.getUri()
    process.env.DB_NAME = 'vaccin_delivery_bootstrap_compile_test'
    process.env.ALLOW_DATABASE_BOOTSTRAP = 'false'
    process.env.CONFIRM_DATABASE_BOOTSTRAP = ''

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ;({ BootstrapAppModule } = require('./bootstrap-app.module') as {
      BootstrapAppModule: new () => unknown
    })
  }, 120_000)

  afterAll(async () => {
    await mongo.stop()
    for (const key of envKeys) {
      const value = previousEnv[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  it('compiles and resolves SeedService without throttler dependency errors', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BootstrapAppModule],
    }).compile()

    const app = moduleRef.createNestApplication()
    await app.init()

    const seedService = app.get(SeedService)
    expect(seedService).toBeDefined()

    expect(() => app.get(StrictIdentityThrottlerGuard)).toThrow()

    await app.close()
  })

  it('does not invoke SeedService.runBootstrap during Nest construction', async () => {
    const runBootstrap = jest.spyOn(SeedService.prototype, 'runBootstrap')

    const moduleRef = await Test.createTestingModule({
      imports: [BootstrapAppModule],
    }).compile()

    const app = moduleRef.createNestApplication()
    await app.init()

    expect(runBootstrap).not.toHaveBeenCalled()

    const seedService = app.get(SeedService)
    await expect(seedService.runBootstrap()).rejects.toThrow(
      /ALLOW_DATABASE_BOOTSTRAP/,
    )

    await app.close()
    runBootstrap.mockRestore()
  })

  it('Firebase Admin remains uninitialized in test compilation (no Auth writes)', () => {
    const firebase = new FirebaseService()
    expect(() => firebase.getAuth()).toThrow(/not initialized/)
  })
})

describe('Bootstrap CLI write ordering contract', () => {
  it('constructs Nest context before runBootstrap (no intentional writes before construction)', () => {
    const source = readFileSync(
      join(__dirname, '..', 'bootstrap-cli.ts'),
      'utf8',
    )
    const contextIdx = source.indexOf('createApplicationContext')
    const runIdx = source.indexOf('await seedService.runBootstrap()')
    expect(contextIdx).toBeGreaterThan(-1)
    expect(runIdx).toBeGreaterThan(contextIdx)
    expect(source).toContain('no intentional seed writes')
  })

  it('keeps bootstrap confirmation phrase and Logger for phase logging', () => {
    expect(Logger).toBeDefined()
    expect(DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE).toBe(
      'BOOTSTRAP_PUBLIC_DEMO_DATABASE',
    )
  })
})
