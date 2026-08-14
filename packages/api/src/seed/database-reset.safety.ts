import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import {
  DATABASE_RESET_CONFIRMATION_PHRASE,
  EnvConfig,
  safeMongoHostname,
} from '../config/env.validation'
import { safeMongoScheme } from '../config/mongo-connection'

export class DatabaseResetSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseResetSafetyError'
  }
}

/**
 * Hostnames that this repository actually uses for local Mongo.
 * From docker-compose-dev.yml (service `mongo`, container
 * `vaccin-delivery-mongo-dev`, published 27017) and packages/api/.env.example
 * (`localhost`). `127.0.0.1` is the loopback form used by local tests.
 */
export const LOCAL_DATABASE_RESET_ALLOWED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  'mongo',
  'vaccin-delivery-mongo-dev',
] as const

/** Local Compose / .env.example application database only. */
export const LOCAL_DATABASE_RESET_ALLOWED_DATABASE_NAMES = [
  'vaccin-delivery',
] as const

export const LOCAL_DATABASE_RESET_UNSAFE_DATABASE_NAMES = [
  'admin',
  'local',
  'config',
  'test',
] as const

const ALLOWED_HOSTS = new Set<string>(LOCAL_DATABASE_RESET_ALLOWED_HOSTNAMES)
const ALLOWED_DATABASES = new Set<string>(
  LOCAL_DATABASE_RESET_ALLOWED_DATABASE_NAMES,
)
const UNSAFE_DATABASES = new Set(
  LOCAL_DATABASE_RESET_UNSAFE_DATABASE_NAMES.map(name => name.toLowerCase()),
)

@Injectable()
export class DatabaseResetSafetyService {
  private readonly logger = new Logger(DatabaseResetSafetyService.name)

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Abort before any Mongo connection when the environment is unsafe.
   * Requires NODE_ENV=development, ALLOW_DATABASE_RESET=true, the exact
   * confirmation phrase, and a local Mongo target.
   */
  assertResetAllowed(): void {
    const nodeEnv = this.configService.get('NODE_ENV', { infer: true })

    if (nodeEnv === 'production') {
      throw new DatabaseResetSafetyError(
        'Database reset refused: NODE_ENV=production. Reset is local-development only.',
      )
    }

    if (nodeEnv !== 'development') {
      throw new DatabaseResetSafetyError(
        `Database reset refused: NODE_ENV must be "development" (got "${nodeEnv}").`,
      )
    }

    const allowReset = this.configService.get('ALLOW_DATABASE_RESET', {
      infer: true,
    })

    if (allowReset !== true) {
      throw new DatabaseResetSafetyError(
        'Database reset refused: set ALLOW_DATABASE_RESET=true to run the reset CLI.',
      )
    }

    const confirmation = this.configService.get('CONFIRM_DATABASE_RESET', {
      infer: true,
    })

    if (confirmation !== DATABASE_RESET_CONFIRMATION_PHRASE) {
      throw new DatabaseResetSafetyError(
        `Database reset refused: set CONFIRM_DATABASE_RESET=${DATABASE_RESET_CONFIRMATION_PHRASE} exactly.`,
      )
    }

    this.assertLocalMongoTarget()
  }

  /**
   * Print only non-sensitive reset target values before any deletes.
   * Never logs credentials, passwords, or full Mongo connection strings.
   */
  logResetTargetConfirmation(): void {
    const nodeEnv = this.configService.get('NODE_ENV', { infer: true })
    const dbName = this.configService.get('DB_NAME', { infer: true })
    const dbHost = this.configService.get('DB_HOST', { infer: true })
    const hostname = safeMongoHostname(dbHost)

    this.logger.log('Reset target confirmation (safe values only):')
    this.logger.log(`- database name: ${dbName}`)
    this.logger.log(`- Mongo hostname: ${hostname}`)
    this.logger.log(`- environment: ${nodeEnv}`)
  }

  private assertLocalMongoTarget(): void {
    const dbHost = this.configService.get('DB_HOST', { infer: true })?.trim()
    const dbName = this.configService.get('DB_NAME', { infer: true })?.trim()

    if (!dbHost) {
      throw new DatabaseResetSafetyError(
        'Database reset refused: DB_HOST is missing.',
      )
    }

    const scheme = safeMongoScheme(dbHost)
    if (scheme === 'mongodb+srv') {
      throw new DatabaseResetSafetyError(
        'Database reset refused: mongodb+srv hosts are not allowed.',
      )
    }
    if (scheme !== 'mongodb') {
      throw new DatabaseResetSafetyError(
        'Database reset refused: DB_HOST must use the mongodb:// scheme.',
      )
    }

    const hostname = safeMongoHostname(dbHost)
    const hostnameNormalized = hostname.toLowerCase()

    if (
      hostnameNormalized === 'unparsed' ||
      hostnameNormalized === 'unknown' ||
      hostnameNormalized.length === 0
    ) {
      throw new DatabaseResetSafetyError(
        'Database reset refused: Mongo hostname could not be parsed.',
      )
    }

    if (hostnameNormalized.includes('mongodb.net')) {
      throw new DatabaseResetSafetyError(
        'Database reset refused: Atlas / remote Mongo hosts are not allowed.',
      )
    }

    if (!ALLOWED_HOSTS.has(hostnameNormalized)) {
      throw new DatabaseResetSafetyError(
        `Database reset refused: Mongo hostname "${hostname}" is not a local host used by this repository.`,
      )
    }

    if (!dbName) {
      throw new DatabaseResetSafetyError(
        'Database reset refused: DB_NAME is empty.',
      )
    }

    if (UNSAFE_DATABASES.has(dbName.toLowerCase())) {
      throw new DatabaseResetSafetyError(
        `Database reset refused: database name "${dbName}" is a system or generic database.`,
      )
    }

    if (!ALLOWED_DATABASES.has(dbName)) {
      throw new DatabaseResetSafetyError(
        `Database reset refused: database name "${dbName}" is not the local demo/dev application database.`,
      )
    }
  }
}
