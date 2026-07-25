/**
 * Centralized application cache keys (process-local memory cache).
 * Do not scatter literal key strings across services.
 *
 * Vaccine catalogue entries (`vaccines:active`, `vaccines:all`) serialize full
 * Vaccine documents including optional `image` metadata. Phase 25C image
 * upload / replace / delete / admin override MUST call
 * `ApplicationCacheService.invalidateVaccines()` so both keys are cleared.
 */
export const CacheKeys = {
  settingsCurrent: () => 'settings:current',
  vaccinesActive: () => 'vaccines:active',
  vaccinesAll: () => 'vaccines:all',
} as const

export type CacheKey = ReturnType<(typeof CacheKeys)[keyof typeof CacheKeys]>
