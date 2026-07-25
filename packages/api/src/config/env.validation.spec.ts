import {
  buildMongoUrl,
  envValidationSchema,
  safeMongoHostname,
} from './env.validation'

/** Placeholder Azure storage env for production validation cases (not real secrets). */
const PRODUCTION_AZURE_STORAGE = {
  AZURE_STORAGE_CONNECTION_STRING:
    'DefaultEndpointsProtocol=https;AccountName=example;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net',
  AZURE_STORAGE_CONTAINER_NAME: 'vaccine-images',
} as const

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
      (result.value as { ALLOW_E2E_AUTH_BYPASS: boolean })
        .ALLOW_E2E_AUTH_BYPASS,
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
      (result.value as { ALLOW_E2E_AUTH_BYPASS: boolean })
        .ALLOW_E2E_AUTH_BYPASS,
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
      (result.value as { ALLOW_E2E_AUTH_BYPASS: boolean })
        .ALLOW_E2E_AUTH_BYPASS,
    ).toBe(false)
  })

  it('accepts mongodb+srv Atlas-style DB_HOST', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'production',
      PORT: 3000,
      URL_FRONTEND: 'https://example.web.app',
      DB_HOST: 'mongodb+srv://user:pass@cluster0.example.mongodb.net/',
      DB_NAME: 'vaccin-delivery-demo',
      TRUST_PROXY: '1',
      ...PRODUCTION_AZURE_STORAGE,
    })

    expect(result.error).toBeUndefined()
    expect((result.value as { TRUST_PROXY: false | 1 }).TRUST_PROXY).toBe(1)
  })

  it('rejects TRUST_PROXY=true', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'production',
      PORT: 3000,
      URL_FRONTEND: 'https://example.web.app',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      TRUST_PROXY: 'true',
    })

    expect(result.error).toBeDefined()
  })

  it('defaults TRUST_PROXY and ALLOW_DATABASE_BOOTSTRAP to false', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
    })

    expect(result.error).toBeUndefined()
    expect((result.value as { TRUST_PROXY: false | 1 }).TRUST_PROXY).toBe(false)
    expect(
      (result.value as { ALLOW_DATABASE_BOOTSTRAP: boolean })
        .ALLOW_DATABASE_BOOTSTRAP,
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

  it('defaults vaccine image providers to fake outside production', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
    })

    expect(result.error).toBeUndefined()
    expect(
      (result.value as { VACCINE_IMAGE_ANALYSIS_PROVIDER: string })
        .VACCINE_IMAGE_ANALYSIS_PROVIDER,
    ).toBe('fake')
    expect(
      (result.value as { VACCINE_IMAGE_STORAGE_PROVIDER: string })
        .VACCINE_IMAGE_STORAGE_PROVIDER,
    ).toBe('fake')
  })

  it('rejects fake vaccine image providers in production', () => {
    const analysis = envValidationSchema.validate({
      NODE_ENV: 'production',
      PORT: 3000,
      URL_FRONTEND: 'https://example.web.app',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      TRUST_PROXY: '1',
      VACCINE_IMAGE_ANALYSIS_PROVIDER: 'fake',
    })
    expect(analysis.error).toBeDefined()

    const storage = envValidationSchema.validate({
      NODE_ENV: 'production',
      PORT: 3000,
      URL_FRONTEND: 'https://example.web.app',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      TRUST_PROXY: '1',
      VACCINE_IMAGE_STORAGE_PROVIDER: 'fake',
    })
    expect(storage.error).toBeDefined()
  })

  it('defaults vaccine image providers to azure in production', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'production',
      PORT: 3000,
      URL_FRONTEND: 'https://example.web.app',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      TRUST_PROXY: '1',
      ...PRODUCTION_AZURE_STORAGE,
    })

    expect(result.error).toBeUndefined()
    expect(
      (result.value as { VACCINE_IMAGE_ANALYSIS_PROVIDER: string })
        .VACCINE_IMAGE_ANALYSIS_PROVIDER,
    ).toBe('azure')
    expect(
      (result.value as { VACCINE_IMAGE_STORAGE_PROVIDER: string })
        .VACCINE_IMAGE_STORAGE_PROVIDER,
    ).toBe('azure')
    expect(
      (result.value as { AZURE_STORAGE_READ_URL_TTL_SECONDS: number })
        .AZURE_STORAGE_READ_URL_TTL_SECONDS,
    ).toBe(900)
  })

  it('requires Azure storage variables only when storage provider is azure', () => {
    const fakeMode = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      VACCINE_IMAGE_STORAGE_PROVIDER: 'fake',
    })
    expect(fakeMode.error).toBeUndefined()

    const azureMissing = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      VACCINE_IMAGE_STORAGE_PROVIDER: 'azure',
    })
    expect(azureMissing.error).toBeDefined()
    expect(azureMissing.error?.message).toMatch(
      /AZURE_STORAGE_CONNECTION_STRING|AZURE_STORAGE_CONTAINER_NAME/,
    )

    const azureComplete = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      VACCINE_IMAGE_STORAGE_PROVIDER: 'azure',
      ...PRODUCTION_AZURE_STORAGE,
    })
    expect(azureComplete.error).toBeUndefined()
  })

  it('rejects invalid Azure read URL TTL values', () => {
    const tooLow = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      AZURE_STORAGE_READ_URL_TTL_SECONDS: 30,
    })
    expect(tooLow.error).toBeDefined()

    const tooHigh = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      AZURE_STORAGE_READ_URL_TTL_SECONDS: 5000,
    })
    expect(tooHigh.error).toBeDefined()
  })

  it('requires Azure storage variables in production even when omitted from input', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'production',
      PORT: 3000,
      URL_FRONTEND: 'https://example.web.app',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      TRUST_PROXY: '1',
    })
    expect(result.error).toBeDefined()
  })
})

describe('buildMongoUrl', () => {
  it('combines host and database name', () => {
    expect(buildMongoUrl('mongodb://localhost:27017', 'vaccin-delivery')).toBe(
      'mongodb://localhost:27017/vaccin-delivery',
    )
  })

  it('handles trailing slash on host', () => {
    expect(buildMongoUrl('mongodb://localhost:27017/', 'vaccin-delivery')).toBe(
      'mongodb://localhost:27017/vaccin-delivery',
    )
  })

  it('combines mongodb+srv host and database name', () => {
    expect(
      buildMongoUrl(
        'mongodb+srv://user:pass@cluster0.example.mongodb.net/',
        'vaccin-delivery-demo',
      ),
    ).toBe(
      'mongodb+srv://user:pass@cluster0.example.mongodb.net/vaccin-delivery-demo',
    )
  })

  it('inserts DB_NAME before Atlas query params (no silent test fallback)', () => {
    const url = buildMongoUrl(
      'mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true&w=majority',
      'vaccin_delivery',
    )
    const parsed = new URL(url)

    expect(parsed.pathname).toBe('/vaccin_delivery')
    expect(parsed.searchParams.get('retryWrites')).toBe('true')
    expect(parsed.searchParams.get('w')).toBe('majority')
    expect(parsed.pathname).not.toBe('/test')
    expect(url).not.toMatch(/\?[^#]*\/vaccin_delivery/)
  })
})

describe('safeMongoHostname', () => {
  it('returns host only without credentials or connection strings', () => {
    expect(safeMongoHostname('mongodb://mongo:27017')).toBe('mongo')
    expect(
      safeMongoHostname('mongodb://user:secret@mongo:27017/vaccin-delivery'),
    ).toBe('mongo')
    expect(
      safeMongoHostname(
        'mongodb+srv://user:secret@cluster0.example.mongodb.net/',
      ),
    ).toBe('cluster0.example.mongodb.net')
    expect(safeMongoHostname('not-a-url')).toBe('unparsed')
  })
})
