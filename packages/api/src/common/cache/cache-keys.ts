/**
 * Centralized application cache keys (process-local memory cache).
 * Do not scatter literal key strings across services.
 */
export const CacheKeys = {
  settingsCurrent: () => 'settings:current',
  vaccinesActive: () => 'vaccines:active',
  vaccinesAll: () => 'vaccines:all',
} as const

export type CacheKey = ReturnType<(typeof CacheKeys)[keyof typeof CacheKeys]>
