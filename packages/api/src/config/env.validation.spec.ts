import { buildMongoUrl, envValidationSchema } from './env.validation'

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
