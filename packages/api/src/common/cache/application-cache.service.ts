import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Cache } from 'cache-manager'

import { EnvConfig } from '../../config/env.validation'
import { CacheKeys } from './cache-keys'

export type CacheStats = {
  hits: number
  misses: number
  errors: number
}

/**
 * Process-local cache helpers. Failures never break domain reads/writes.
 *
 * cache-manager v7: TTL is milliseconds; `del` returns boolean; use `clear()`
 * (not `reset()`).
 */
@Injectable()
export class ApplicationCacheService {
  private readonly logger = new Logger(ApplicationCacheService.name)
  private readonly stats: CacheStats = { hits: 0, misses: 0, errors: 0 }

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {
    const ttl = this.configService.get('CACHE_REFERENCE_TTL_MS', {
      infer: true,
    })
    this.logger.log(
      `Application cache ready (process-local memory, referenceTtlMs=${ttl})`,
    )
  }

  getStats(): CacheStats {
    return { ...this.stats }
  }

  resetStats(): void {
    this.stats.hits = 0
    this.stats.misses = 0
    this.stats.errors = 0
  }

  referenceTtlMs(): number {
    return this.configService.get('CACHE_REFERENCE_TTL_MS', { infer: true })
  }

  defaultTtlMs(): number {
    return this.configService.get('CACHE_DEFAULT_TTL_MS', { infer: true })
  }

  /**
   * Read-through cache. On cache backend failure, loads from `loader` and does
   * not throw. Never caches rejected promises / thrown errors.
   */
  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    try {
      const cached = await this.cache.get<T>(key)
      if (cached !== undefined && cached !== null) {
        this.stats.hits += 1
        return cached
      }
      this.stats.misses += 1
    } catch (error: unknown) {
      this.stats.errors += 1
      this.logger.warn(
        `Cache get failed for key class; falling back to loader (${summarizeError(error)})`,
      )
    }

    const value = await loader()

    try {
      await this.cache.set(key, value, ttlMs ?? this.referenceTtlMs())
    } catch (error: unknown) {
      this.stats.errors += 1
      this.logger.warn(
        `Cache set failed; continuing with loaded value (${summarizeError(error)})`,
      )
    }

    return value
  }

  async invalidate(key: string): Promise<void> {
    try {
      await this.cache.del(key)
    } catch (error: unknown) {
      this.stats.errors += 1
      this.logger.warn(
        `Cache invalidation failed (${summarizeError(error)})`,
      )
    }
  }

  async invalidateKeys(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.invalidate(key)))
  }

  async invalidateSettings(): Promise<void> {
    await this.invalidate(CacheKeys.settingsCurrent())
  }

  async invalidateVaccines(): Promise<void> {
    await this.invalidateKeys([
      CacheKeys.vaccinesActive(),
      CacheKeys.vaccinesAll(),
    ])
  }
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name
  }
  return 'unknown'
}
