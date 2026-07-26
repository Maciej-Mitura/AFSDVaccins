const REQUIRED_FIREBASE = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

const PLACEHOLDER_PATTERN =
  /^(replace-me|change-me|your-|example|TODO|xxx)|\.example\.|replace-me/i

const VAPID_PUBLIC_KEY_MIN_LENGTH = 80
const URL_SAFE_BASE64_PATTERN = /^[A-Za-z0-9_-]+$/

function isWebPushEnabled(env: Record<string, string | undefined>): boolean {
  const flag = env.VITE_WEB_PUSH_ENABLED?.trim().toLowerCase() ?? ''
  return flag === 'true' || flag === '1'
}

function isValidVapidPublicKey(value: string): boolean {
  if (value.length < VAPID_PUBLIC_KEY_MIN_LENGTH) {
    return false
  }

  const withoutPadding = value.replace(/=+$/, '')
  return URL_SAFE_BASE64_PATTERN.test(withoutPadding)
}

/**
 * Validates PWA build-time environment for production Firebase Hosting deploys.
 * Does not contact external services.
 */
export function collectProductionEnvErrors(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const errors: string[] = []

  const backendUrl = env.VITE_BACKEND_URL?.trim() ?? ''
  const wsUrl = env.VITE_BACKEND_WS_URL?.trim() ?? ''

  if (!backendUrl) {
    errors.push('VITE_BACKEND_URL is required for production builds')
  } else if (!backendUrl.startsWith('https://')) {
    errors.push('VITE_BACKEND_URL must use https:// for production builds')
  }

  if (!wsUrl) {
    errors.push('VITE_BACKEND_WS_URL is required for production builds')
  } else if (!wsUrl.startsWith('wss://')) {
    errors.push('VITE_BACKEND_WS_URL must use wss:// for production builds')
  }

  for (const key of REQUIRED_FIREBASE) {
    const value = env[key]?.trim() ?? ''
    if (!value) {
      errors.push(`${key} is required for production builds`)
      continue
    }
    if (PLACEHOLDER_PATTERN.test(value)) {
      errors.push(
        `${key} still looks like a placeholder — set a real Firebase web config value`,
      )
    }
  }

  const bypass = env.VITE_E2E_AUTH_BYPASS?.trim().toLowerCase() ?? ''
  if (bypass === 'true' || bypass === '1') {
    errors.push(
      'VITE_E2E_AUTH_BYPASS must not be enabled for production builds',
    )
  }

  const vapidPublicKey = env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? ''
  const pushEnabled = isWebPushEnabled(env)

  if (pushEnabled && !vapidPublicKey) {
    errors.push(
      'VITE_WEB_PUSH_VAPID_PUBLIC_KEY is required when VITE_WEB_PUSH_ENABLED is true',
    )
  }

  if (vapidPublicKey) {
    if (PLACEHOLDER_PATTERN.test(vapidPublicKey)) {
      errors.push(
        'VITE_WEB_PUSH_VAPID_PUBLIC_KEY still looks like a placeholder — set the real VAPID public key only',
      )
    } else if (!isValidVapidPublicKey(vapidPublicKey)) {
      errors.push(
        'VITE_WEB_PUSH_VAPID_PUBLIC_KEY must be a URL-safe base64 VAPID public key',
      )
    }
  }

  return errors
}
