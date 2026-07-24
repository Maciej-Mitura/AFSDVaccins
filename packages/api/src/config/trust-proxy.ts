/**
 * Parse TRUST_PROXY into a safe Express trust-proxy setting.
 *
 * Allowed:
 * - unset / '' / false / 0 → disabled (false)
 * - 1 → trust exactly one proxy hop
 *
 * Rejects `true` and other hop counts so operators must opt into a known topology.
 */
export function parseTrustProxy(
  value: unknown,
): false | 1 {
  if (value === undefined || value === null || value === '') {
    return false
  }

  if (value === false || value === 0) {
    return false
  }

  if (value === 1) {
    return 1
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'false' || normalized === '0') {
      return false
    }
    if (normalized === '1') {
      return 1
    }
  }

  throw new Error(
    'TRUST_PROXY must be unset/false/0 (disabled) or 1 (trust one proxy hop)',
  )
}
