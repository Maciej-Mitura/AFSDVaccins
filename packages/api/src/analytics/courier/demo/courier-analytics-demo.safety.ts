export type AnalyticsDemoSafetyInput = {
  nodeEnv?: string | null
  dbName?: string | null
  confirmPhrase?: string | null
}

export const ANALYTICS_DEMO_PRODUCTION_CONFIRM_PHRASE =
  'SEED_ANALYTICS_DEMO_DATA'

const PRODUCTION_LIKE_DB_NAME =
  /(^|[_-])(prod|production|live)([_-]|$)/i

/**
 * Refuse mutating modes against production-like environments unless the
 * operator explicitly confirms with CONFIRM_ANALYTICS_DEMO_DATA.
 */
export function assertAnalyticsDemoMutationAllowed(
  input: AnalyticsDemoSafetyInput,
): void {
  const nodeEnv = (input.nodeEnv ?? '').trim().toLowerCase()
  const dbName = (input.dbName ?? '').trim()
  const confirm = (input.confirmPhrase ?? '').trim()

  const looksProduction =
    nodeEnv === 'production' || PRODUCTION_LIKE_DB_NAME.test(dbName)

  if (!looksProduction) {
    return
  }

  if (confirm !== ANALYTICS_DEMO_PRODUCTION_CONFIRM_PHRASE) {
    throw new Error(
      `Refusing analytics demo mutation: NODE_ENV/DB_NAME looks production-like ` +
        `(dbName=${dbName || '(empty)'}, nodeEnv=${nodeEnv || '(empty)'}). ` +
        `Set CONFIRM_ANALYTICS_DEMO_DATA=${ANALYTICS_DEMO_PRODUCTION_CONFIRM_PHRASE} to override.`,
    )
  }
}

export function isProductionLikeAnalyticsDemoTarget(
  input: AnalyticsDemoSafetyInput,
): boolean {
  const nodeEnv = (input.nodeEnv ?? '').trim().toLowerCase()
  const dbName = (input.dbName ?? '').trim()
  return nodeEnv === 'production' || PRODUCTION_LIKE_DB_NAME.test(dbName)
}
