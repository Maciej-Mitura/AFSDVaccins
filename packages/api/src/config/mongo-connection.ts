import { buildMongoUrl } from './env.validation'

export type MongoHostScheme = 'mongodb' | 'mongodb+srv' | 'unknown'

export type TypeOrmMongoConnectionOptions = {
  type: 'mongodb'
  url: string
  database: string
  synchronize: boolean
  autoLoadEntities: true
}

/**
 * Build TypeORM Mongo options that always select DB_NAME explicitly.
 * Atlas URIs often omit a database path and only carry query params; relying on
 * URL path alone can leave TypeORM/Mongo without a database (driver default: test).
 */
export function buildTypeOrmMongoOptions(params: {
  dbHost: string
  dbName: string
  synchronize: boolean
}): TypeOrmMongoConnectionOptions {
  const dbHost = params.dbHost?.trim()
  const dbName = params.dbName?.trim()

  if (!dbHost || !dbName) {
    throw new Error('MongoDB configuration is missing (DB_HOST, DB_NAME)')
  }

  return {
    type: 'mongodb',
    url: buildMongoUrl(dbHost, dbName),
    database: dbName,
    synchronize: params.synchronize,
    autoLoadEntities: true,
  }
}

/** Scheme only — never return credentials, host, or the full URI. */
export function safeMongoScheme(dbHost: string): MongoHostScheme {
  const trimmed = dbHost.trim().toLowerCase()
  if (trimmed.startsWith('mongodb+srv://')) {
    return 'mongodb+srv'
  }
  if (trimmed.startsWith('mongodb://')) {
    return 'mongodb'
  }
  return 'unknown'
}

/** True only for Mongo NamespaceNotFound (missing collection / ns). */
export function isMongoNamespaceNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const withCode = error as { code?: unknown; codeName?: unknown }
  return withCode.code === 26 || withCode.codeName === 'NamespaceNotFound'
}
