import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from './supported-locales'

/** Persisted explicit user choice — not a generic "language" key. */
export const LOCALE_STORAGE_KEY = 'vaccin-delivery:locale'

/**
 * Normalize a browser / BCP 47 language tag to a supported locale.
 *
 * Rules: trim, case-insensitive, `_` → `-`, then match:
 * - exact supported code (nl, en, zh, es)
 * - primary subtag when supported (nl-BE → nl, zh-Hans → zh)
 * - unsupported → null (caller falls back to default)
 */
export function normalizeLocale(
  raw: string | null | undefined,
): SupportedLocale | null {
  if (raw == null) {
    return null
  }

  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  const normalized = trimmed.replace(/_/g, '-').toLowerCase()

  if (isSupportedLocale(normalized)) {
    return normalized
  }

  const primary = normalized.split('-')[0]
  if (isSupportedLocale(primary)) {
    return primary
  }

  return null
}

export function readPersistedLocale(
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof localStorage !==
  'undefined'
    ? localStorage
    : null,
): SupportedLocale | null {
  if (!storage) {
    return null
  }

  try {
    return normalizeLocale(storage.getItem(LOCALE_STORAGE_KEY))
  } catch {
    return null
  }
}

export function persistLocale(
  locale: SupportedLocale,
  storage: Pick<Storage, 'setItem'> | null | undefined = typeof localStorage !==
  'undefined'
    ? localStorage
    : null,
): void {
  if (!storage) {
    return
  }

  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Quota / private mode — preference is best-effort.
  }
}

export function detectBrowserLocale(
  languages: readonly string[] | undefined = typeof navigator !== 'undefined'
    ? navigator.languages
    : undefined,
  language: string | undefined = typeof navigator !== 'undefined'
    ? navigator.language
    : undefined,
): SupportedLocale | null {
  const candidates: string[] = []

  if (languages?.length) {
    candidates.push(...languages)
  }

  if (language) {
    candidates.push(language)
  }

  for (const candidate of candidates) {
    const matched = normalizeLocale(candidate)
    if (matched) {
      return matched
    }
  }

  return null
}

/**
 * Resolution priority:
 * 1. explicit persisted user choice
 * 2. normalized browser preference
 * 3. default nl
 */
export function resolveInitialLocale(options?: {
  storage?: Pick<Storage, 'getItem'> | null
  languages?: readonly string[]
  language?: string
}): SupportedLocale {
  const persisted = readPersistedLocale(options?.storage)
  if (persisted) {
    return persisted
  }

  const fromBrowser = detectBrowserLocale(options?.languages, options?.language)
  if (fromBrowser) {
    return fromBrowser
  }

  return DEFAULT_LOCALE
}
