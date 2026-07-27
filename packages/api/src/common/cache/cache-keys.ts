/**
 * Centralized application cache keys (process-local memory cache).
 * Do not scatter literal key strings across services.
 *
 * Vaccine catalogue entries (`vaccines:active`, `vaccines:all`) serialize full
 * Vaccine documents including optional `image` metadata (storageKey,
 * validationStatus, …). Temporary read URLs (Azure SAS / fake URLs) must NEVER
 * be stored on Vaccine documents or inside these cache entries — they are
 * generated at GraphQL response time via VaccineImageUrlService / ResolveField
 * `imageUrl`. Caching a SAS would leave expired URLs trapped until cache TTL.
 *
 * Phase 25D+ image upload / replace / delete / admin override MUST call
 * `ApplicationCacheService.invalidateVaccines()` so both keys are cleared
 * after metadata changes.
 */
export const CacheKeys = {
  settingsCurrent: () => 'settings:current',
  vaccinesActive: () => 'vaccines:active',
  vaccinesAll: () => 'vaccines:all',
  /** Phase 32A — all-time ADMIN courier performance analytics (short TTL). */
  courierPerformanceAnalyticsAllTime: () =>
    'analytics:courier-performance:all-time',
} as const

export type CacheKey = ReturnType<(typeof CacheKeys)[keyof typeof CacheKeys]>
