/**
 * VAPID public-key helpers for PushManager.subscribe.
 * Never log or display the key value in application UI.
 */

const URL_SAFE_BASE64_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * Minimum decoded length for a typical uncompressed P-256 public key (65 bytes)
 * encoded as URL-safe base64 (~87 chars). Allow a slightly lower floor for
 * padded variants while rejecting obvious placeholders.
 */
export const VAPID_PUBLIC_KEY_MIN_LENGTH = 80

export function isValidVapidPublicKeyFormat(
  value: string | null | undefined,
): boolean {
  if (value == null) {
    return false
  }

  const trimmed = value.trim()
  if (trimmed.length < VAPID_PUBLIC_KEY_MIN_LENGTH) {
    return false
  }

  // Allow standard base64 padding; PushManager expects URL-safe.
  const withoutPadding = trimmed.replace(/=+$/, '')
  return URL_SAFE_BASE64_PATTERN.test(withoutPadding)
}

/**
 * Converts a URL-safe base64 VAPID public key to a Uint8Array for
 * PushManager.subscribe({ applicationServerKey }).
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const trimmed = base64String.trim()
  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4)
  const base64 = (trimmed + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData =
    typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary')

  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i)
  }

  return output
}

/**
 * Reads the public VAPID key from the Vite env (never the private key).
 */
export function readViteVapidPublicKey(
  env: Record<string, string | undefined> = import.meta.env,
): string | null {
  const value = env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? ''
  if (!value) {
    return null
  }

  return isValidVapidPublicKeyFormat(value) ? value : null
}

export function isWebPushEnvEnabled(
  env: Record<string, string | undefined> = import.meta.env,
): boolean {
  const flag = env.VITE_WEB_PUSH_ENABLED?.trim().toLowerCase() ?? ''
  return flag === 'true' || flag === '1'
}
