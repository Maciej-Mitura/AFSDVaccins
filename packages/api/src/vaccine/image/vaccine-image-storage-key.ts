import { VaccineImageStorageKeyInvalidException } from './vaccine-image-storage.exceptions'

/**
 * Server-generated object keys only. Never accept empty keys or path traversal.
 * Original filenames must not be used as blob paths by callers.
 */
export function assertValidVaccineImageStorageKey(storageKey: string): string {
  if (typeof storageKey !== 'string') {
    throw new VaccineImageStorageKeyInvalidException()
  }

  const trimmed = storageKey.trim()
  if (trimmed.length === 0 || trimmed !== storageKey) {
    throw new VaccineImageStorageKeyInvalidException()
  }

  if (
    trimmed.includes('..') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    throw new VaccineImageStorageKeyInvalidException()
  }

  return trimmed
}
