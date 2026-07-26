import { describe, expect, it } from 'vitest'

import {
  isValidVapidPublicKeyFormat,
  readViteVapidPublicKey,
  urlBase64ToUint8Array,
} from './vapid'

/** Deterministic valid URL-safe base64 sample (65 decoded bytes). Not a real secret. */
const SAMPLE_VAPID_PUBLIC =
  'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc'

describe('vapid helpers', () => {
  it('converts URL-safe base64 public key correctly for PushManager.subscribe', () => {
    const bytes = urlBase64ToUint8Array(SAMPLE_VAPID_PUBLIC)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBe(65)
  })

  it('validates presence/format without exposing key in assertions beyond length', () => {
    expect(isValidVapidPublicKeyFormat(SAMPLE_VAPID_PUBLIC)).toBe(true)
    expect(isValidVapidPublicKeyFormat('short')).toBe(false)
    expect(isValidVapidPublicKeyFormat('!!!')).toBe(false)
    expect(isValidVapidPublicKeyFormat(null)).toBe(false)
  })

  it('reads Vite public key only when format is valid', () => {
    expect(
      readViteVapidPublicKey({
        VITE_WEB_PUSH_VAPID_PUBLIC_KEY: SAMPLE_VAPID_PUBLIC,
      }),
    ).toBe(SAMPLE_VAPID_PUBLIC)

    expect(
      readViteVapidPublicKey({
        VITE_WEB_PUSH_VAPID_PUBLIC_KEY: 'too-short',
      }),
    ).toBeNull()
  })
})
