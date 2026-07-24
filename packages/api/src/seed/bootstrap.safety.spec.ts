import { ConfigService } from '@nestjs/config'

import {
  DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE,
  EnvConfig,
} from '../config/env.validation'
import {
  BootstrapSafetyError,
  BootstrapSafetyService,
} from './bootstrap.safety'

function mockConfig(
  values: Partial<EnvConfig>,
): ConfigService<EnvConfig, true> {
  return {
    get: (key: keyof EnvConfig) => values[key],
  } as ConfigService<EnvConfig, true>
}

describe('BootstrapSafetyService', () => {
  it('rejects missing ALLOW_DATABASE_BOOTSTRAP', () => {
    const service = new BootstrapSafetyService(
      mockConfig({
        NODE_ENV: 'production',
        ALLOW_DATABASE_BOOTSTRAP: false,
        CONFIRM_DATABASE_BOOTSTRAP: DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE,
      }),
    )

    expect(() => service.assertBootstrapAllowed()).toThrow(BootstrapSafetyError)
    expect(() => service.assertBootstrapAllowed()).toThrow(
      /ALLOW_DATABASE_BOOTSTRAP/,
    )
  })

  it('rejects wrong confirmation phrase', () => {
    const service = new BootstrapSafetyService(
      mockConfig({
        NODE_ENV: 'production',
        ALLOW_DATABASE_BOOTSTRAP: true,
        CONFIRM_DATABASE_BOOTSTRAP: 'yes',
      }),
    )

    expect(() => service.assertBootstrapAllowed()).toThrow(
      new RegExp(DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE),
    )
  })

  it('allows production when both gates match', () => {
    const service = new BootstrapSafetyService(
      mockConfig({
        NODE_ENV: 'production',
        ALLOW_DATABASE_BOOTSTRAP: true,
        CONFIRM_DATABASE_BOOTSTRAP: DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE,
      }),
    )

    expect(() => service.assertBootstrapAllowed()).not.toThrow()
  })

  it('does not require NODE_ENV=development', () => {
    const service = new BootstrapSafetyService(
      mockConfig({
        NODE_ENV: 'production',
        ALLOW_DATABASE_BOOTSTRAP: true,
        CONFIRM_DATABASE_BOOTSTRAP: DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE,
      }),
    )

    expect(() => service.assertBootstrapAllowed()).not.toThrow()
  })

  it('requires passwords and personal admin email', () => {
    const service = new BootstrapSafetyService(
      mockConfig({
        NODE_ENV: 'production',
        ALLOW_DATABASE_BOOTSTRAP: true,
        CONFIRM_DATABASE_BOOTSTRAP: DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE,
      }),
    )

    expect(() => service.requireDemoPassword()).toThrow(/SEED_DEMO_PASSWORD/)
    expect(() => service.requireTeacherAdminPassword()).toThrow(
      /SEED_TEACHER_ADMIN_PASSWORD/,
    )
    expect(() => service.requirePersonalAdminEmail()).toThrow(
      /SEED_PERSONAL_ADMIN_EMAIL/,
    )
  })
})
