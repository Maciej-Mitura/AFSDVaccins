/**
 * Single body-size parser for API_JSON_BODY_LIMIT (Express-style units).
 * Units are case-insensitive: b, kb, mb, gb (1024-based).
 */

const BODY_LIMIT_PATTERN = /^([1-9]\d*)(gb|mb|kb|b)$/i

/** Soft ceiling for JSON API bodies (media uploads are Phase 25 / separate). */
export const API_JSON_BODY_LIMIT_MAX_BYTES = 32 * 1024 * 1024

export function isValidBodyLimitSyntax(limit: string): boolean {
  return BODY_LIMIT_PATTERN.test(limit.trim())
}

/**
 * Parse an Express-style size string to bytes.
 * Rejects zero, negative, malformed, and unsupported units.
 */
export function parseBodyLimitToBytes(limit: string): number {
  const trimmed = limit.trim()
  const match = BODY_LIMIT_PATTERN.exec(trimmed)
  if (!match) {
    throw new Error(
      `Invalid body limit "${limit}". Use forms like 100kb, 1mb (positive integer + b|kb|mb|gb).`,
    )
  }

  const amount = Number(match[1])
  const unit = match[2].toLowerCase()

  let bytes: number
  switch (unit) {
    case 'gb':
      bytes = amount * 1024 * 1024 * 1024
      break
    case 'mb':
      bytes = amount * 1024 * 1024
      break
    case 'kb':
      bytes = amount * 1024
      break
    default:
      bytes = amount
  }

  if (!Number.isFinite(bytes) || bytes <= 0) {
    throw new Error(`Body limit "${limit}" resolved to a non-positive size`)
  }

  return bytes
}

export function assertBodyLimitWithinPolicy(limit: string): number {
  const bytes = parseBodyLimitToBytes(limit)
  if (bytes > API_JSON_BODY_LIMIT_MAX_BYTES) {
    throw new Error(
      `Body limit "${limit}" exceeds maximum ${API_JSON_BODY_LIMIT_MAX_BYTES} bytes`,
    )
  }
  return bytes
}
