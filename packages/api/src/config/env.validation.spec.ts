import { buildMongoUrl, envValidationSchema, safeMongoHostname } from './env.validation'

describe('envValidationSchema', () => {
  it('accepts valid development configuration', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
    })

    expect(result.error).toBeUndefined()
    expect(result.value).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_NAME: 'vaccin-delivery',
    })
  })

  it('rejects invalid URL_FRONTEND', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'not-a-url',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
    })

    expect(result.error).toBeDefined()
  })

  it('rejects non-mongodb DB_HOST', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'postgres://localhost:5432',
      DB_NAME: 'vaccin-delivery',
    })

    expect(result.error).toBeDefined()
  })

  it('rejects invalid NODE_ENV', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'staging',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
    })

    expect(result.error).toBeDefined()
  })

  it('defaults ALLOW_DATABASE_SEED and ALLOW_E2E_AUTH_BYPASS to false', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
    })

    expect(result.error).toBeUndefined()
    expect(
      (result.value as { ALLOW_DATABASE_SEED: boolean }).ALLOW_DATABASE_SEED,
    ).toBe(false)
    expect(
      (result.value as { ALLOW_E2E_AUTH_BYPASS: boolean }).ALLOW_E2E_AUTH_BYPASS,
    ).toBe(false)
  })

  it('accepts ALLOW_E2E_AUTH_BYPASS for Playwright browser E2E', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'test',
      PORT: 3100,
      URL_FRONTEND: 'http://localhost:4174',
      DB_HOST: 'mongodb://127.0.0.1:27017',
      DB_NAME: 'vaccin_delivery_playwright_e2e',
      ALLOW_E2E_AUTH_BYPASS: 'true',
    })

    expect(result.error).toBeUndefined()
    expect(
      (result.value as { ALLOW_E2E_AUTH_BYPASS: boolean }).ALLOW_E2E_AUTH_BYPASS,
    ).toBe(true)
  })

  it('defaults ALLOW_E2E_AUTH_BYPASS to false even when NODE_ENV is omitted', () => {
    const result = envValidationSchema.validate({
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
    })

    expect(result.error).toBeUndefined()
    expect(
      (result.value as { ALLOW_E2E_AUTH_BYPASS: boolean }).ALLOW_E2E_AUTH_BYPASS,
    ).toBe(false)
  })

  it('accepts seed-related optional variables', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      ALLOW_DATABASE_SEED: 'true',
      SEED_DEMO_PASSWORD: 'demo-only',
      SEED_TEACHER_ADMIN_PASSWORD: 'teacher-only',
      SEED_PERSONAL_ADMIN_EMAIL: 'owner@example.com',
      SEED_PERSONAL_ADMIN_FIREBASE_UID: 'optional-uid',
      SEED_DOCENT_FIREBASE_UID: 'optional-uid',
    })

    expect(result.error).toBeUndefined()
    expect(
      (result.value as { ALLOW_DATABASE_SEED: boolean }).ALLOW_DATABASE_SEED,
    ).toBe(true)
  })
})

describe('buildMongoUrl', () => {
  it('combines host and database name', () => {
    expect(
      buildMongoUrl('mongodb://localhost:27017', 'vaccin-delivery'),
    ).toBe('mongodb://localhost:27017/vaccin-delivery')
  })

  it('handles trailing slash on host', () => {
    expect(
      buildMongoUrl('mongodb://localhost:27017/', 'vaccin-delivery'),
    ).toBe('mongodb://localhost:27017/vaccin-delivery')
  })
})

describe('safeMongoHostname', () => {
  it('returns host only without credentials or connection strings', () => {
    expect(safeMongoHostname('mongodb://mongo:27017')).toBe('mongo')
    expect(
      safeMongoHostname('mongodb://user:secret@mongo:27017/vaccin-delivery'),
    ).toBe('mongo')
    expect(safeMongoHostname('not-a-url')).toBe('unparsed')
  })
})
