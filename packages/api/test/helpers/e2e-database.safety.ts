/**
 * Hard safety gate for GraphQL E2E: never wipe or sync against a non-test DB.
 */

export const E2E_DB_NAME_MARKERS = ['_test', 'e2e'] as const

export class UnsafeE2eDatabaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeE2eDatabaseError'
  }
}

export function isSafeE2eDatabaseName(dbName: string): boolean {
  const normalized = dbName.trim().toLowerCase()

  if (!normalized) {
    return false
  }

  return E2E_DB_NAME_MARKERS.some(marker => normalized.includes(marker))
}

export function assertSafeE2eDatabaseName(dbName: string): void {
  if (!isSafeE2eDatabaseName(dbName)) {
    throw new UnsafeE2eDatabaseError(
      `Refusing E2E database operations: DB_NAME "${dbName}" must contain a test marker (${E2E_DB_NAME_MARKERS.join(
        ' or ',
      )}).`,
    )
  }
}
