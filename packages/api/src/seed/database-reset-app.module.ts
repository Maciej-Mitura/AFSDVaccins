import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { envValidationSchema } from '../config/env.validation'
import {
  createDatabaseResetMongoClient,
  DATABASE_RESET_MONGO_CLIENT_FACTORY,
  DatabaseResetService,
} from './database-reset.service'
import { DatabaseResetSafetyService } from './database-reset.safety'

/**
 * Lean Nest context for the local exam/demo Mongo reset CLI.
 * Config + Mongo driver factory only — no HTTP, GraphQL, TypeORM, or Firebase.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        convert: true,
      },
    }),
  ],
  providers: [
    DatabaseResetSafetyService,
    {
      provide: DATABASE_RESET_MONGO_CLIENT_FACTORY,
      useValue: createDatabaseResetMongoClient,
    },
    DatabaseResetService,
  ],
})
export class DatabaseResetAppModule {}
