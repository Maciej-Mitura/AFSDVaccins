import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { createCache, type Cache } from 'cache-manager'

import { ApplicationCacheService } from './application-cache.service'
import { CacheKeys } from './cache-keys'

describe('ApplicationCacheService (real cache-manager)', () => {
  let service: ApplicationCacheService
  let cache: Cache

  beforeEach(async () => {
    cache = createCache({ ttl: 30_000 })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationCacheService,
        {
          provide: CACHE_MANAGER,
          useValue: cache,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'CACHE_REFERENCE_TTL_MS') {
                return 60_000
              }
              if (key === 'CACHE_DEFAULT_TTL_MS') {
                return 30_000
              }
              return undefined
            },
          },
        },
      ],
    }).compile()

    service = module.get(ApplicationCacheService)
    service.resetStats()
  })

  afterEach(async () => {
    await cache.clear()
  })

  it('loads from loader on miss and serves cache on hit', async () => {
    const loader = jest.fn(() => Promise.resolve({ value: 1 }))

    const first = await service.getOrSet(CacheKeys.settingsCurrent(), loader)
    const second = await service.getOrSet(CacheKeys.settingsCurrent(), loader)

    expect(first).toEqual({ value: 1 })
    expect(second).toEqual({ value: 1 })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(service.getStats()).toMatchObject({ hits: 1, misses: 1 })
  })

  it('reloads after invalidation', async () => {
    let version = 1
    const loader = jest.fn(() => Promise.resolve({ version }))

    await service.getOrSet(CacheKeys.vaccinesActive(), loader)
    version = 2
    await service.invalidateVaccines()
    const after = await service.getOrSet(CacheKeys.vaccinesActive(), loader)

    expect(after).toEqual({ version: 2 })
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('falls back to loader when cache get fails', async () => {
    const failingCache = {
      get: jest.fn().mockRejectedValue(new Error('boom')),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(true),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationCacheService,
        { provide: CACHE_MANAGER, useValue: failingCache },
        {
          provide: ConfigService,
          useValue: {
            get: () => 60_000,
          },
        },
      ],
    }).compile()

    const resilient = module.get(ApplicationCacheService)
    const loader = jest.fn(() => Promise.resolve('from-db'))
    const value = await resilient.getOrSet('settings:current', loader)

    expect(value).toBe('from-db')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(resilient.getStats().errors).toBeGreaterThan(0)
  })

  it('uses distinct keys for active vs all vaccine catalogues', () => {
    expect(CacheKeys.vaccinesActive()).not.toBe(CacheKeys.vaccinesAll())
  })

  it('exposes del/clear semantics of cache-manager v7', async () => {
    await cache.set('k', 'v', 1000)
    expect(await cache.get('k')).toBe('v')
    expect(await cache.del('k')).toBe(true)
    expect(await cache.get('k')).toBeUndefined()
    await cache.set('k2', 'v2', 1000)
    expect(await cache.clear()).toBe(true)
    expect(await cache.get('k2')).toBeUndefined()
  })
})
