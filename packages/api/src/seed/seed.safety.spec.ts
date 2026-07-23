import { ConfigService } from '@nestjs/config'

import { EnvConfig } from '../config/env.validation'
import { SeedSafetyError, SeedSafetyService } from './seed.safety'

function mockConfig(
  values: Partial<EnvConfig>,
): ConfigService<EnvConfig, true> {
  return {
    get: (key: keyof EnvConfig) => values[key],
  } as ConfigService<EnvConfig, true>
}

describe('SeedSafetyService', () => {
  it('rejects production NODE_ENV', () => {
    const service = new SeedSafetyService(
      mockConfig({
        NODE_ENV: 'production',
        ALLOW_DATABASE_SEED: true,
        SEED_DEMO_PASSWORD: 'demo',
      }),
    )

    expect(() => service.assertSeedAllowed()).toThrow(SeedSafetyError)
    expect(() => service.assertSeedAllowed()).toThrow(/production/)
  })

  it('rejects missing ALLOW_DATABASE_SEED', () => {
    const service = new SeedSafetyService(
      mockConfig({
        NODE_ENV: 'development',
        ALLOW_DATABASE_SEED: false,
        SEED_DEMO_PASSWORD: 'demo',
      }),
    )

    expect(() => service.assertSeedAllowed()).toThrow(SeedSafetyError)
    expect(() => service.assertSeedAllowed()).toThrow(/ALLOW_DATABASE_SEED/)
  })

  it('rejects NODE_ENV=test for the seed CLI', () => {
    const service = new SeedSafetyService(
      mockConfig({
        NODE_ENV: 'test',
        ALLOW_DATABASE_SEED: true,
        SEED_DEMO_PASSWORD: 'demo',
      }),
    )

    expect(() => service.assertSeedAllowed()).toThrow(/development/)
  })

  it('allows development with explicit seed flag', () => {
    const service = new SeedSafetyService(
      mockConfig({
        NODE_ENV: 'development',
        ALLOW_DATABASE_SEED: true,
        SEED_DEMO_PASSWORD: 'demo',
      }),
    )

    expect(() => service.assertSeedAllowed()).not.toThrow()
  })

  it('requires SEED_DEMO_PASSWORD', () => {
    const service = new SeedSafetyService(
      mockConfig({
        NODE_ENV: 'development',
        ALLOW_DATABASE_SEED: true,
      }),
    )

    expect(() => service.requireDemoPassword()).toThrow(/SEED_DEMO_PASSWORD/)
  })

  it('requires SEED_TEACHER_ADMIN_PASSWORD', () => {
    const service = new SeedSafetyService(
      mockConfig({
        NODE_ENV: 'development',
        ALLOW_DATABASE_SEED: true,
        SEED_DEMO_PASSWORD: 'demo',
      }),
    )

    expect(() => service.requireTeacherAdminPassword()).toThrow(
      /SEED_TEACHER_ADMIN_PASSWORD/,
    )
  })

  it('requires SEED_PERSONAL_ADMIN_EMAIL', () => {
    const service = new SeedSafetyService(
      mockConfig({
        NODE_ENV: 'development',
        ALLOW_DATABASE_SEED: true,
        SEED_DEMO_PASSWORD: 'demo',
        SEED_TEACHER_ADMIN_PASSWORD: 'teacher',
      }),
    )

    expect(() => service.requirePersonalAdminEmail()).toThrow(
      /SEED_PERSONAL_ADMIN_EMAIL/,
    )
  })
})
