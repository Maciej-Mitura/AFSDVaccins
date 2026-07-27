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

/** Placeholder Azure Vision env for production validation cases (not real secrets). */
const PRODUCTION_AZURE_VISION = {
  AZURE_VISION_ENDPOINT: 'https://example.cognitiveservices.azure.com',
  AZURE_VISION_KEY: 'example-vision-key',
} as const

/** Placeholder Azure Speech env for production validation cases (not real secrets). */
const PRODUCTION_AZURE_SPEECH = {
  ROUTE_VOICE_TRANSCRIPTION_PROVIDER: 'azure' as const,
  AZURE_SPEECH_ENDPOINT: 'https://example.cognitiveservices.azure.com',
  AZURE_SPEECH_KEY: 'example-speech-key',
} as const

const PRODUCTION_AZURE = {
  ...PRODUCTION_AZURE_STORAGE,
  ...PRODUCTION_AZURE_VISION,
  ...PRODUCTION_AZURE_SPEECH,
} as const

/** Phase 26A placeholder signing secret (not a real secret). */
const DELIVERY_QR_SIGNING = {
  DELIVERY_QR_SIGNING_SECRET: 'test-fixture-delivery-qr-signing-secret-32b!',
} as const

/** Phase 27A placeholder VAPID keys (not real secrets). */
const WEB_PUSH_VAPID = {
  PUSH_PROVIDER: 'webpush' as const,
  WEB_PUSH_VAPID_PUBLIC_KEY:
    'BNcRdtreKN2ymJxwWZiOrQbKYi-U1WUPVP_vJKdF8n0abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP',
  WEB_PUSH_VAPID_PRIVATE_KEY: 'ci-placeholder-vapid-private-key-min-40-chars!!',
  WEB_PUSH_SUBJECT: 'mailto:ops@example.com',
} as const

const BASE_DEV = {
  NODE_ENV: 'development' as const,
  PORT: 3000,
  URL_FRONTEND: 'http://localhost:5173',
  DB_HOST: 'mongodb://localhost:27017',
  DB_NAME: 'vaccin-delivery',
  ...DELIVERY_QR_SIGNING,
}

const BASE_PRODUCTION = {
  NODE_ENV: 'production' as const,
  PORT: 3000,
  URL_FRONTEND: 'https://example.web.app',
  DB_HOST: 'mongodb://localhost:27017',
  DB_NAME: 'vaccin-delivery',
  TRUST_PROXY: '1',
  ...PRODUCTION_AZURE,
  ...DELIVERY_QR_SIGNING,
  ...WEB_PUSH_VAPID,
}

describe('envValidationSchema', () => {
  it('accepts valid development configuration', () => {
    const result = envValidationSchema.validate({
      ...BASE_DEV,
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
      ...BASE_DEV,
      URL_FRONTEND: 'not-a-url',
    })

    expect(result.error).toBeDefined()
  })

  it('rejects non-mongodb DB_HOST', () => {
    const result = envValidationSchema.validate({
      ...BASE_DEV,
      DB_HOST: 'postgres://localhost:5432',
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
      ...DELIVERY_QR_SIGNING,
    })

    expect(result.error).toBeDefined()
  })

  it('defaults ALLOW_DATABASE_SEED and ALLOW_E2E_AUTH_BYPASS to false', () => {
    const result = envValidationSchema.validate({
      ...BASE_DEV,
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
      ...DELIVERY_QR_SIGNING,
    })

    expect(result.error).toBeUndefined()
    expect(
      (result.value as { ALLOW_E2E_AUTH_BYPASS: boolean })
        .ALLOW_E2E_AUTH_BYPASS,
    ).toBe(false)
  })

  it('accepts mongodb+srv Atlas-style DB_HOST', () => {
    const result = envValidationSchema.validate({
      ...BASE_PRODUCTION,
      DB_HOST: 'mongodb+srv://user:pass@cluster0.example.mongodb.net/',
      DB_NAME: 'vaccin-delivery-demo',
    })

    expect(result.error).toBeUndefined()
    expect((result.value as { TRUST_PROXY: false | 1 }).TRUST_PROXY).toBe(1)
  })

  it('rejects TRUST_PROXY=true', () => {
    const result = envValidationSchema.validate({
      ...BASE_PRODUCTION,
      TRUST_PROXY: 'true',
    })

    expect(result.error).toBeDefined()
  })

  it('defaults TRUST_PROXY and ALLOW_DATABASE_BOOTSTRAP to false', () => {
    const result = envValidationSchema.validate({
      ...BASE_DEV,
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
      ...BASE_DEV,
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
      ...BASE_DEV,
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
      ...BASE_PRODUCTION,
      VACCINE_IMAGE_ANALYSIS_PROVIDER: 'fake',
    })
    expect(analysis.error).toBeDefined()

    const storage = envValidationSchema.validate({
      ...BASE_PRODUCTION,
      VACCINE_IMAGE_STORAGE_PROVIDER: 'fake',
    })
    expect(storage.error).toBeDefined()
  })

  it('defaults vaccine image providers to azure in production', () => {
    const result = envValidationSchema.validate({
      ...BASE_PRODUCTION,
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
      ...BASE_DEV,
      VACCINE_IMAGE_STORAGE_PROVIDER: 'fake',
    })
    expect(fakeMode.error).toBeUndefined()

    const azureMissing = envValidationSchema.validate({
      ...BASE_DEV,
      VACCINE_IMAGE_STORAGE_PROVIDER: 'azure',
    })
    expect(azureMissing.error).toBeDefined()
    expect(azureMissing.error?.message).toMatch(
      /AZURE_STORAGE_CONNECTION_STRING|AZURE_STORAGE_CONTAINER_NAME/,
    )

    const azureComplete = envValidationSchema.validate({
      ...BASE_DEV,
      VACCINE_IMAGE_STORAGE_PROVIDER: 'azure',
      ...PRODUCTION_AZURE_STORAGE,
    })
    expect(azureComplete.error).toBeUndefined()
  })

  it('requires Azure Vision variables only when analysis provider is azure', () => {
    const fakeMode = envValidationSchema.validate({
      ...BASE_DEV,
      VACCINE_IMAGE_ANALYSIS_PROVIDER: 'fake',
    })
    expect(fakeMode.error).toBeUndefined()

    const azureMissing = envValidationSchema.validate({
      ...BASE_DEV,
      VACCINE_IMAGE_ANALYSIS_PROVIDER: 'azure',
    })
    expect(azureMissing.error).toBeDefined()
    expect(azureMissing.error?.message).toMatch(
      /AZURE_VISION_ENDPOINT|AZURE_VISION_KEY/,
    )

    const httpEndpoint = envValidationSchema.validate({
      ...BASE_DEV,
      VACCINE_IMAGE_ANALYSIS_PROVIDER: 'azure',
      AZURE_VISION_ENDPOINT: 'http://example.cognitiveservices.azure.com',
      AZURE_VISION_KEY: 'example-vision-key',
    })
    expect(httpEndpoint.error).toBeDefined()

    const azureComplete = envValidationSchema.validate({
      ...BASE_DEV,
      VACCINE_IMAGE_ANALYSIS_PROVIDER: 'azure',
      ...PRODUCTION_AZURE_VISION,
    })
    expect(azureComplete.error).toBeUndefined()
    expect(
      (azureComplete.value as { AZURE_VISION_TIMEOUT_MS: number })
        .AZURE_VISION_TIMEOUT_MS,
    ).toBe(10_000)
  })

  it('rejects invalid Azure Vision timeout values', () => {
    const tooLow = envValidationSchema.validate({
      ...BASE_DEV,
      AZURE_VISION_TIMEOUT_MS: 500,
    })
    expect(tooLow.error).toBeDefined()

    const tooHigh = envValidationSchema.validate({
      ...BASE_DEV,
      AZURE_VISION_TIMEOUT_MS: 60_000,
    })
    expect(tooHigh.error).toBeDefined()
  })

  it('requires Azure Speech variables when transcription provider is azure', () => {
    const fakeMode = envValidationSchema.validate({
      ...BASE_DEV,
      ROUTE_VOICE_TRANSCRIPTION_PROVIDER: 'fake',
    })
    expect(fakeMode.error).toBeUndefined()

    const azureMissing = envValidationSchema.validate({
      ...BASE_DEV,
      ROUTE_VOICE_TRANSCRIPTION_PROVIDER: 'azure',
    })
    expect(azureMissing.error).toBeDefined()
    expect(azureMissing.error?.message).toMatch(
      /AZURE_SPEECH_ENDPOINT|AZURE_SPEECH_KEY/,
    )

    const productionMissingSpeech = envValidationSchema.validate({
      NODE_ENV: 'production',
      PORT: 3000,
      URL_FRONTEND: 'https://example.web.app',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      TRUST_PROXY: '1',
      ...PRODUCTION_AZURE_STORAGE,
      ...PRODUCTION_AZURE_VISION,
      ...DELIVERY_QR_SIGNING,
      ...WEB_PUSH_VAPID,
    })
    expect(productionMissingSpeech.error).toBeDefined()
    expect(productionMissingSpeech.error?.message).toMatch(
      /AZURE_SPEECH_ENDPOINT|AZURE_SPEECH_KEY/,
    )

    const azureComplete = envValidationSchema.validate({
      ...BASE_DEV,
      ...PRODUCTION_AZURE_SPEECH,
    })
    expect(azureComplete.error).toBeUndefined()
  })

  it('rejects invalid Azure read URL TTL values', () => {
    const tooLow = envValidationSchema.validate({
      ...BASE_DEV,
      AZURE_STORAGE_READ_URL_TTL_SECONDS: 30,
    })
    expect(tooLow.error).toBeDefined()

    const tooHigh = envValidationSchema.validate({
      ...BASE_DEV,
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
      ...DELIVERY_QR_SIGNING,
    })
    expect(result.error).toBeDefined()
  })

  it('requires DELIVERY_QR_SIGNING_SECRET in development and production', () => {
    const development = envValidationSchema.validate({
      NODE_ENV: 'development',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
    })
    expect(development.error).toBeDefined()
    expect(development.error?.message).toMatch(/DELIVERY_QR_SIGNING_SECRET/)

    const production = envValidationSchema.validate({
      NODE_ENV: 'production',
      PORT: 3000,
      URL_FRONTEND: 'https://example.web.app',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
      TRUST_PROXY: '1',
      ...PRODUCTION_AZURE,
    })
    expect(production.error).toBeDefined()
    expect(production.error?.message).toMatch(/DELIVERY_QR_SIGNING_SECRET/)
  })

  it('rejects weak DELIVERY_QR_SIGNING_SECRET values', () => {
    const result = envValidationSchema.validate({
      ...BASE_DEV,
      DELIVERY_QR_SIGNING_SECRET: 'too-short',
    })
    expect(result.error).toBeDefined()
    expect(result.error?.message).toMatch(/DELIVERY_QR_SIGNING_SECRET/)
  })

  it('allows omitting DELIVERY_QR_SIGNING_SECRET in test (explicit injection elsewhere)', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'test',
      PORT: 3000,
      URL_FRONTEND: 'http://localhost:5173',
      DB_HOST: 'mongodb://localhost:27017',
      DB_NAME: 'vaccin-delivery',
    })
    expect(result.error).toBeUndefined()
  })

  it('rejects fake push provider in production', () => {
    const result = envValidationSchema.validate({
      ...BASE_PRODUCTION,
      PUSH_PROVIDER: 'fake',
    })
    expect(result.error).toBeDefined()
    expect(result.error?.message).toMatch(/PUSH_PROVIDER/)
  })

  it('requires VAPID secrets when PUSH_PROVIDER=webpush', () => {
    const result = envValidationSchema.validate({
      ...BASE_DEV,
      PUSH_PROVIDER: 'webpush',
    })
    expect(result.error).toBeDefined()
    expect(result.error?.message).toMatch(/WEB_PUSH_VAPID/)
  })

  it('rejects weak VAPID public key when webpush selected', () => {
    const result = envValidationSchema.validate({
      ...BASE_DEV,
      PUSH_PROVIDER: 'webpush',
      WEB_PUSH_VAPID_PUBLIC_KEY: 'too-short',
      WEB_PUSH_VAPID_PRIVATE_KEY: 'y'.repeat(40),
      WEB_PUSH_SUBJECT: 'mailto:ops@example.com',
    })
    expect(result.error).toBeDefined()
    expect(result.error?.message).toMatch(/WEB_PUSH_VAPID_PUBLIC_KEY/)
  })

  it('defaults push provider to fake outside production', () => {
    const result = envValidationSchema.validate({ ...BASE_DEV })
    expect(result.error).toBeUndefined()
    expect((result.value as { PUSH_PROVIDER: string }).PUSH_PROVIDER).toBe(
      'fake',
    )
  })

  it('accepts production with webpush VAPID placeholders', () => {
    const result = envValidationSchema.validate({ ...BASE_PRODUCTION })
    expect(result.error).toBeUndefined()
    expect((result.value as { PUSH_PROVIDER: string }).PUSH_PROVIDER).toBe(
      'webpush',
    )
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
