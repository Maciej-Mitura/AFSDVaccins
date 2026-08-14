import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  DATABASE_RESET_CONFIRMATION_PHRASE,
  EnvConfig,
} from '../config/env.validation'
import { DatabaseResetSafetyService } from './database-reset.safety'
import {
  DatabaseResetMongoClientFactory,
  DatabaseResetService,
} from './database-reset.service'

function mockConfig(
  values: Partial<EnvConfig>,
): ConfigService<EnvConfig, true> {
  return {
    get: (key: keyof EnvConfig) => values[key],
  } as ConfigService<EnvConfig, true>
}

const SECRET_PASSWORD = 'super-secret-mongo-password'
const SECRET_URI = `mongodb://demo-user:${SECRET_PASSWORD}@localhost:27017`
const FIREBASE_JSON = '{"type":"service_account","private_key":"fake"}'

const VALID_LOCAL = {
  NODE_ENV: 'development' as const,
  ALLOW_DATABASE_RESET: true,
  CONFIRM_DATABASE_RESET: DATABASE_RESET_CONFIRMATION_PHRASE,
  DB_HOST: SECRET_URI,
  DB_NAME: 'vaccin-delivery',
  FIREBASE_SERVICE_ACCOUNT_JSON: FIREBASE_JSON,
}

function collectedLoggerOutput(
  spies: Array<jest.SpyInstance<unknown, unknown[]>>,
): string {
  const lines: string[] = []
  for (const spy of spies) {
    for (const callArgs of spy.mock.calls) {
      lines.push(callArgs.map(arg => String(arg)).join(' '))
    }
  }
  return lines.join('\n')
}

describe('DatabaseResetService', () => {
  let logSpy: jest.SpyInstance<unknown, unknown[]>
  let errorSpy: jest.SpyInstance<unknown, unknown[]>
  let warnSpy: jest.SpyInstance<unknown, unknown[]>
  let debugSpy: jest.SpyInstance<unknown, unknown[]>

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation()
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
    debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation()
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
    debugSpy.mockRestore()
  })

  it('drops only the configured database on a valid local configuration', async () => {
    const dropped: string[] = []
    const dbCalls: string[] = []
    const close = jest.fn()
    const factory: DatabaseResetMongoClientFactory = url => {
      expect(new URL(url).pathname).toBe('/vaccin-delivery')
      expect(new URL(url).hostname).toBe('localhost')
      return {
        connect: jest.fn(),
        db: (name: string) => {
          dbCalls.push(name)
          return {
            dropDatabase: jest.fn(() => {
              dropped.push(name)
              return Promise.resolve(true)
            }),
          }
        },
        close,
      }
    }

    const service = new DatabaseResetService(
      mockConfig(VALID_LOCAL),
      new DatabaseResetSafetyService(mockConfig(VALID_LOCAL)),
      factory,
    )

    const result = await service.run()

    expect(result).toEqual({ databaseName: 'vaccin-delivery' })
    expect(dbCalls).toEqual(['vaccin-delivery'])
    expect(dropped).toEqual(['vaccin-delivery'])
    expect(dropped).not.toContain('admin')
    expect(dropped).not.toContain('local')
    expect(dropped).not.toContain('config')
    expect(dropped).not.toContain('keep-other-data')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does not construct a Mongo client when reset is refused', async () => {
    const factory = jest.fn()
    const refused = mockConfig({
      ...VALID_LOCAL,
      NODE_ENV: 'production',
    })
    const service = new DatabaseResetService(
      refused,
      new DatabaseResetSafetyService(refused),
      factory,
    )

    await expect(service.run()).rejects.toThrow(/production/)
    expect(factory).not.toHaveBeenCalled()
  })

  it('never logs Mongo URIs, credentials, or Firebase secrets', async () => {
    const factory: DatabaseResetMongoClientFactory = url => {
      expect(url).toContain(SECRET_PASSWORD)
      return {
        connect: jest.fn(),
        db: () => ({
          dropDatabase: jest.fn().mockResolvedValue(true),
        }),
        close: jest.fn(),
      }
    }

    const service = new DatabaseResetService(
      mockConfig(VALID_LOCAL),
      new DatabaseResetSafetyService(mockConfig(VALID_LOCAL)),
      factory,
    )

    await service.run()

    const output = collectedLoggerOutput([logSpy, errorSpy, warnSpy, debugSpy])
    expect(output).toContain('vaccin-delivery')
    expect(output).toContain('localhost')
    expect(output).toContain('development')
    expect(output).not.toContain(SECRET_PASSWORD)
    expect(output).not.toContain(SECRET_URI)
    expect(output).not.toContain('demo-user')
    expect(output).not.toContain(FIREBASE_JSON)
    expect(output).not.toContain('private_key')
    expect(output).not.toMatch(/mongodb:\/\/[^\s]+@/)
    expect(output.toLowerCase()).toContain(
      'firebase authentication users were not modified',
    )
  })

  it('does not import or invoke Firebase services', () => {
    const resetDir = __dirname
    const sources = [
      readFileSync(join(resetDir, 'database-reset.service.ts'), 'utf8'),
      readFileSync(join(resetDir, 'database-reset.safety.ts'), 'utf8'),
      readFileSync(join(resetDir, 'database-reset-app.module.ts'), 'utf8'),
      readFileSync(join(resetDir, '..', 'reset-cli.ts'), 'utf8'),
    ].join('\n')

    expect(sources).not.toMatch(/from ['"]firebase/)
    expect(sources).not.toMatch(/firebase-admin/)
    expect(sources).not.toContain('AuthenticationModule')
    expect(sources).not.toContain('SeedFirebaseProvisioningService')
    expect(sources).not.toContain('SeedService')
    expect(sources).not.toContain('TypeOrmModule')
  })
})
