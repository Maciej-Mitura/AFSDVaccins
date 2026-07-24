import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import {
  DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE,
  EnvConfig,
  safeMongoHostname,
} from '../config/env.validation'

export class BootstrapSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BootstrapSafetyError'
  }
}

/**
 * Safety gates for the one-off production/demo bootstrap CLI.
 * Independent of development ALLOW_DATABASE_SEED — does not require NODE_ENV=development.
 */
@Injectable()
export class BootstrapSafetyService {
  private readonly logger = new Logger(BootstrapSafetyService.name)

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  assertBootstrapAllowed(): void {
    const allowBootstrap = this.configService.get('ALLOW_DATABASE_BOOTSTRAP', {
      infer: true,
    })

    if (allowBootstrap !== true) {
      throw new BootstrapSafetyError(
        'Database bootstrap refused: set ALLOW_DATABASE_BOOTSTRAP=true to run the bootstrap CLI.',
      )
    }

    const confirmation = this.configService.get('CONFIRM_DATABASE_BOOTSTRAP', {
      infer: true,
    })

    if (confirmation !== DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE) {
      throw new BootstrapSafetyError(
        `Database bootstrap refused: set CONFIRM_DATABASE_BOOTSTRAP=${DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE} exactly.`,
      )
    }

    const allowSeed = this.configService.get('ALLOW_DATABASE_SEED', {
      infer: true,
    })
    if (allowSeed === true) {
      this.logger.warn(
        'ALLOW_DATABASE_SEED is also true; bootstrap uses ALLOW_DATABASE_BOOTSTRAP gates only.',
      )
    }
  }

  /**
   * Print only non-sensitive bootstrap target values before any writes.
   * Never logs credentials, passwords, or full Mongo connection strings.
   */
  logBootstrapTargetConfirmation(): void {
    const nodeEnv = this.configService.get('NODE_ENV', { infer: true })
    const allowBootstrap = this.configService.get('ALLOW_DATABASE_BOOTSTRAP', {
      infer: true,
    })
    const dbName = this.configService.get('DB_NAME', { infer: true })
    const dbHost = this.configService.get('DB_HOST', { infer: true })
    const hostname = safeMongoHostname(dbHost)

    this.logger.log('Bootstrap target confirmation (safe values only):')
    this.logger.log(`- database name: ${dbName}`)
    this.logger.log(`- Mongo service hostname: ${hostname}`)
    this.logger.log(`- environment: ${nodeEnv}`)
    this.logger.log(`- ALLOW_DATABASE_BOOTSTRAP: ${allowBootstrap}`)
    this.logger.log(
      `- CONFIRM_DATABASE_BOOTSTRAP: ${DATABASE_BOOTSTRAP_CONFIRMATION_PHRASE} (matched)`,
    )
  }

  requireDemoPassword(): string {
    const password = this.configService.get('SEED_DEMO_PASSWORD', {
      infer: true,
    })

    if (!password || password.trim().length === 0) {
      throw new BootstrapSafetyError(
        'Database bootstrap refused: SEED_DEMO_PASSWORD is required (demo accounts only).',
      )
    }

    return password
  }

  requireTeacherAdminPassword(): string {
    const password = this.configService.get('SEED_TEACHER_ADMIN_PASSWORD', {
      infer: true,
    })

    if (!password || password.trim().length === 0) {
      throw new BootstrapSafetyError(
        'Database bootstrap refused: SEED_TEACHER_ADMIN_PASSWORD is required for docent@howest.be.',
      )
    }

    return password
  }

  requirePersonalAdminEmail(): string {
    const email = this.configService.get('SEED_PERSONAL_ADMIN_EMAIL', {
      infer: true,
    })

    if (!email || email.trim().length === 0) {
      throw new BootstrapSafetyError(
        'Database bootstrap refused: SEED_PERSONAL_ADMIN_EMAIL is required for the personal ADMIN account.',
      )
    }

    return email.trim().toLowerCase()
  }
}
