import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MongoClient } from 'mongodb'

import { buildMongoUrl, EnvConfig } from '../config/env.validation'
import { DatabaseResetSafetyService } from './database-reset.safety'

export const DATABASE_RESET_MONGO_CLIENT_FACTORY =
  'DATABASE_RESET_MONGO_CLIENT_FACTORY'

export type DatabaseResetMongoClient = {
  connect(): Promise<unknown>
  db(name: string): { dropDatabase(): Promise<unknown> }
  close(): Promise<unknown>
}

export type DatabaseResetMongoClientFactory = (
  url: string,
) => DatabaseResetMongoClient

export const createDatabaseResetMongoClient: DatabaseResetMongoClientFactory = (
  url: string,
) => new MongoClient(url)

@Injectable()
export class DatabaseResetService {
  private readonly logger = new Logger(DatabaseResetService.name)

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly safetyService: DatabaseResetSafetyService,
    @Inject(DATABASE_RESET_MONGO_CLIENT_FACTORY)
    private readonly mongoClientFactory: DatabaseResetMongoClientFactory,
  ) {}

  /**
   * Drop only the configured local application database.
   * Does not touch Firebase Auth, Docker volumes, or other Mongo databases.
   */
  async run(): Promise<{ databaseName: string }> {
    this.safetyService.assertResetAllowed()
    this.safetyService.logResetTargetConfirmation()

    const dbName = this.configService.get('DB_NAME', { infer: true }).trim()
    const dbHost = this.configService.get('DB_HOST', { infer: true })
    const url = buildMongoUrl(dbHost, dbName)
    const client = this.mongoClientFactory(url)

    try {
      await client.connect()
      await client.db(dbName).dropDatabase()
      this.logger.log(
        `Local demo database reset complete: dropped application database "${dbName}".`,
      )
      this.logger.log('Firebase Authentication users were not modified.')
      return { databaseName: dbName }
    } finally {
      await client.close()
    }
  }
}
