import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { EnvConfig, safeMongoHostname } from '../config/env.validation'

export class SeedSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeedSafetyError'
  }
}

@Injectable()
export class SeedSafetyService {
  private readonly logger = new Logger(SeedSafetyService.name)

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

  /**
   * Print only non-sensitive seed target values before any writes.
   * Never logs credentials, passwords, or full Mongo connection strings.
   */
  logSeedTargetConfirmation(): void {
    const nodeEnv = this.configService.get('NODE_ENV', { infer: true })
    const allowSeed = this.configService.get('ALLOW_DATABASE_SEED', {
      infer: true,
    })
    const dbName = this.configService.get('DB_NAME', { infer: true })
    const dbHost = this.configService.get('DB_HOST', { infer: true })
    const hostname = safeMongoHostname(dbHost)

    this.logger.log('Seed target confirmation (safe values only):')
    this.logger.log(`- database name: ${dbName}`)
    this.logger.log(`- Mongo service hostname: ${hostname}`)
    this.logger.log(`- environment: ${nodeEnv}`)
    this.logger.log(`- ALLOW_DATABASE_SEED: ${allowSeed}`)
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
