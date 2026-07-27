import { envValidationSchema } from '../../config/env.validation'

const BASE_DEV = {
  NODE_ENV: 'development' as const,
  PORT: 3000,
  URL_FRONTEND: 'http://localhost:5173',
  DB_HOST: 'mongodb://localhost:27017',
  DB_NAME: 'vaccin-delivery',
  DELIVERY_QR_SIGNING_SECRET: 'test-fixture-delivery-qr-signing-secret-32b!',
}

describe('AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER', () => {
  it('defaults to route-voice-reports when omitted', () => {
    const result = envValidationSchema.validate({ ...BASE_DEV })

    expect(result.error).toBeUndefined()
    expect(
      (
        result.value as {
          AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER: string
        }
      ).AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER,
    ).toBe('route-voice-reports')
  })

  it('accepts an explicit private container name', () => {
    const result = envValidationSchema.validate({
      ...BASE_DEV,
      AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER: 'route-voice-reports-prod',
    })

    expect(result.error).toBeUndefined()
    expect(
      (
        result.value as {
          AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER: string
        }
      ).AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER,
    ).toBe('route-voice-reports-prod')
  })

  it('rejects invalid container names', () => {
    const result = envValidationSchema.validate({
      ...BASE_DEV,
      AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER: 'Invalid_Container',
    })

    expect(result.error).toBeDefined()
  })
})
