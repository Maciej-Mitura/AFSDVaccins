import { describe, expect, it } from 'vitest'

import { collectProductionEnvErrors } from './config/production-env-validation'

const validEnv = {
  VITE_BACKEND_URL: 'https://api.example.com/graphql',
  VITE_BACKEND_WS_URL: 'wss://api.example.com/graphql',
  VITE_FIREBASE_API_KEY: 'AIzaSyDemoKeyNotReal00000000000000000',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-app.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-app',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-app.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
  VITE_FIREBASE_APP_ID: '1:123456789012:web:abcdef',
}

describe('collectProductionEnvErrors', () => {
  it('accepts valid HTTPS/WSS production values', () => {
    expect(collectProductionEnvErrors(validEnv)).toEqual([])
  })

  it('rejects http and ws URLs', () => {
    const errors = collectProductionEnvErrors({
      ...validEnv,
      VITE_BACKEND_URL: 'http://api.example.com/graphql',
      VITE_BACKEND_WS_URL: 'ws://api.example.com/graphql',
    })
    expect(errors.some(e => e.includes('https://'))).toBe(true)
    expect(errors.some(e => e.includes('wss://'))).toBe(true)
  })

  it('rejects replace-me placeholders', () => {
    const errors = collectProductionEnvErrors({
      ...validEnv,
      VITE_FIREBASE_PROJECT_ID: 'replace-me',
    })
    expect(errors.some(e => e.includes('VITE_FIREBASE_PROJECT_ID'))).toBe(true)
  })

  it('rejects E2E auth bypass', () => {
    const errors = collectProductionEnvErrors({
      ...validEnv,
      VITE_E2E_AUTH_BYPASS: 'true',
    })
    expect(errors.some(e => e.includes('VITE_E2E_AUTH_BYPASS'))).toBe(true)
  })
})
