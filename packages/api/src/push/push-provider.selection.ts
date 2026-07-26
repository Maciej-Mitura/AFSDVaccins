export type PushProviderMode = 'fake' | 'webpush'

export const WEB_PUSH_VAPID_PUBLIC_KEY_MIN_LENGTH = 80
export const WEB_PUSH_VAPID_PRIVATE_KEY_MIN_LENGTH = 40
export const WEB_PUSH_SUBJECT_PATTERN = /^(mailto:|https:\/\/)/i

/**
 * Resolves push provider mode from config.
 * Fake is never allowed when NODE_ENV=production.
 */
export function resolvePushProviderMode(
  configured: string | undefined,
  nodeEnv: string,
): PushProviderMode {
  const fallback: PushProviderMode =
    nodeEnv === 'production' ? 'webpush' : 'fake'
  const mode = configured?.trim() || fallback

  if (mode !== 'fake' && mode !== 'webpush') {
    throw new Error(
      `Invalid PUSH_PROVIDER "${mode}" (expected fake|webpush)`,
    )
  }

  if (mode === 'fake' && nodeEnv === 'production') {
    throw new Error('Fake push provider cannot be activated in production')
  }

  return mode
}

export function assertWebPushSecrets(
  publicKey: string | undefined,
  privateKey: string | undefined,
  subject: string | undefined,
): asserts publicKey is string {
  if (!publicKey || publicKey.length < WEB_PUSH_VAPID_PUBLIC_KEY_MIN_LENGTH) {
    throw new Error(
      `WEB_PUSH_VAPID_PUBLIC_KEY is required (min ${WEB_PUSH_VAPID_PUBLIC_KEY_MIN_LENGTH} characters) when PUSH_PROVIDER=webpush`,
    )
  }

  if (
    !privateKey ||
    privateKey.length < WEB_PUSH_VAPID_PRIVATE_KEY_MIN_LENGTH
  ) {
    throw new Error(
      `WEB_PUSH_VAPID_PRIVATE_KEY is required (min ${WEB_PUSH_VAPID_PRIVATE_KEY_MIN_LENGTH} characters) when PUSH_PROVIDER=webpush`,
    )
  }

  if (!subject || !WEB_PUSH_SUBJECT_PATTERN.test(subject)) {
    throw new Error(
      'WEB_PUSH_SUBJECT must be a mailto: or https:// URI when PUSH_PROVIDER=webpush',
    )
  }
}
