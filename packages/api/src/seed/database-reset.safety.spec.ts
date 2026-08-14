import { ConfigService } from '@nestjs/config'

import {
  DATABASE_RESET_CONFIRMATION_PHRASE,
  EnvConfig,
} from '../config/env.validation'
import {
  DatabaseResetSafetyError,
  DatabaseResetSafetyService,
  LOCAL_DATABASE_RESET_ALLOWED_DATABASE_NAMES,
  LOCAL_DATABASE_RESET_ALLOWED_HOSTNAMES,
} from './database-reset.safety'

function mockConfig(
  values: Partial<EnvConfig>,
): ConfigService<EnvConfig, true> {
  return {
    get: (key: keyof EnvConfig) => values[key],
  } as ConfigService<EnvConfig, true>
}

const VALID_LOCAL = {
  NODE_ENV: 'development' as const,
  ALLOW_DATABASE_RESET: true,
  CONFIRM_DATABASE_RESET: DATABASE_RESET_CONFIRMATION_PHRASE,
  DB_HOST: 'mongodb://localhost:27017',
  DB_NAME: 'vaccin-delivery',
}

describe('DatabaseResetSafetyService', () => {
  it('exposes the repository local Mongo hosts and demo database name', () => {
    expect(LOCAL_DATABASE_RESET_ALLOWED_HOSTNAMES).toEqual([
      'localhost',
      '127.0.0.1',
      'mongo',
      'vaccin-delivery-mongo-dev',
    ])
    expect(LOCAL_DATABASE_RESET_ALLOWED_DATABASE_NAMES).toEqual([
      'vaccin-delivery',
    ])
  })

  it('rejects production NODE_ENV', () => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        ...VALID_LOCAL,
        NODE_ENV: 'production',
      }),
    )

    expect(() => service.assertResetAllowed()).toThrow(DatabaseResetSafetyError)
    expect(() => service.assertResetAllowed()).toThrow(/production/)
  })

  it('rejects missing ALLOW_DATABASE_RESET', () => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        ...VALID_LOCAL,
        ALLOW_DATABASE_RESET: false,
      }),
    )

    expect(() => service.assertResetAllowed()).toThrow(DatabaseResetSafetyError)
    expect(() => service.assertResetAllowed()).toThrow(/ALLOW_DATABASE_RESET/)
  })

  it('rejects when ALLOW_DATABASE_RESET is unset', () => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        NODE_ENV: 'development',
        CONFIRM_DATABASE_RESET: DATABASE_RESET_CONFIRMATION_PHRASE,
        DB_HOST: VALID_LOCAL.DB_HOST,
        DB_NAME: VALID_LOCAL.DB_NAME,
      }),
    )

    expect(() => service.assertResetAllowed()).toThrow(/ALLOW_DATABASE_RESET/)
  })

  it('rejects NODE_ENV=test', () => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        ...VALID_LOCAL,
        NODE_ENV: 'test',
      }),
    )

    expect(() => service.assertResetAllowed()).toThrow(/development/)
  })

  it('rejects incorrect confirmation phrase', () => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        ...VALID_LOCAL,
        CONFIRM_DATABASE_RESET: 'yes',
      }),
    )

    expect(() => service.assertResetAllowed()).toThrow(
      new RegExp(DATABASE_RESET_CONFIRMATION_PHRASE),
    )
  })

  it('rejects missing confirmation phrase', () => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        NODE_ENV: 'development',
        ALLOW_DATABASE_RESET: true,
        DB_HOST: VALID_LOCAL.DB_HOST,
        DB_NAME: VALID_LOCAL.DB_NAME,
      }),
    )

    expect(() => service.assertResetAllowed()).toThrow(
      /CONFIRM_DATABASE_RESET/,
    )
  })

  it('rejects mongodb+srv hosts', () => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        ...VALID_LOCAL,
        DB_HOST:
          'mongodb+srv://user:secret@cluster0.example.mongodb.net/?retryWrites=true',
      }),
    )

    expect(() => service.assertResetAllowed()).toThrow(/mongodb\+srv/)
  })

  it('rejects Atlas mongodb.net hosts even on mongodb://', () => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        ...VALID_LOCAL,
        DB_HOST: 'mongodb://user:secret@cluster0.example.mongodb.net:27017',
      }),
    )

    expect(() => service.assertResetAllowed()).toThrow(/Atlas|remote/)
  })

  it('rejects remote hostnames outside the local allowlist', () => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        ...VALID_LOCAL,
        DB_HOST: 'mongodb://db.example.com:27017',
      }),
    )

    expect(() => service.assertResetAllowed()).toThrow(/not a local host/)
  })

  it.each([
    'admin',
    'local',
    'config',
    'test',
    'ADMIN',
    'vaccin-delivery-production-demo',
  ])('rejects unsafe or non-demo database name %s', dbName => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        ...VALID_LOCAL,
        DB_NAME: dbName,
      }),
    )

    expect(() => service.assertResetAllowed()).toThrow(DatabaseResetSafetyError)
  })

  it('rejects an empty database name', () => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        ...VALID_LOCAL,
        DB_NAME: '   ',
      }),
    )

    expect(() => service.assertResetAllowed()).toThrow(/empty/)
  })

  it.each([
    'mongodb://localhost:27017',
    'mongodb://127.0.0.1:27017',
    'mongodb://mongo:27017',
    'mongodb://vaccin-delivery-mongo-dev:27017',
  ])('allows local host %s with the demo database name', dbHost => {
    const service = new DatabaseResetSafetyService(
      mockConfig({
        ...VALID_LOCAL,
        DB_HOST: dbHost,
      }),
    )

    expect(() => service.assertResetAllowed()).not.toThrow()
  })
})
