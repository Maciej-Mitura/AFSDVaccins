import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { EnvConfig } from '../config/env.validation'

export class SeedSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeedSafetyError'
  }
}

@Injectable()
export class SeedSafetyService {
  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Abort before any Firebase or MongoDB writes when the environment is unsafe.
   * Requires NODE_ENV=development and ALLOW_DATABASE_SEED=true.
   */
  assertSeedAllowed(): void {
    const nodeEnv = this.configService.get('NODE_ENV', { infer: true })

    if (nodeEnv === 'production') {
      throw new SeedSafetyError(
        'Database seed refused: NODE_ENV=production. Seed is development-only.',
      )
    }

    if (nodeEnv !== 'development') {
      throw new SeedSafetyError(
        `Database seed refused: NODE_ENV must be "development" (got "${nodeEnv}").`,
      )
    }

    const allowSeed = this.configService.get('ALLOW_DATABASE_SEED', {
      infer: true,
    })

    if (allowSeed !== true) {
      throw new SeedSafetyError(
        'Database seed refused: set ALLOW_DATABASE_SEED=true to run the seed CLI.',
      )
    }
  }

  requireDemoPassword(): string {
    const password = this.configService.get('SEED_DEMO_PASSWORD', {
      infer: true,
    })

    if (!password || password.trim().length === 0) {
      throw new SeedSafetyError(
        'Database seed refused: SEED_DEMO_PASSWORD is required (demo accounts only).',
      )
    }

    return password
  }
}
