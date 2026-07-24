/**
 * Resolve teacher-compatible flat dotted keys (`label.password.recovery`)
 * as literal map keys. Do not use `flatJson` — it cannot represent both
 * `label.password` and `label.password.recovery` without conflicts.
 */
export function flatKeyMessageResolver(
  obj: unknown,
  path: string,
): string | null {
  if (obj !== null && typeof obj === 'object' && path in obj) {
    const value = (obj as Record<string, unknown>)[path]
    return typeof value === 'string' ? value : null
  }
  return null
}
