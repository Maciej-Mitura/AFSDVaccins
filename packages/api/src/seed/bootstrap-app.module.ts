import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import {
  buildMongoUrl,
  envValidationSchema,
  safeMongoHostname,
} from '../config/env.validation'
import { SeedModule } from './seed.module'

/**
 * Lean Nest context for the one-off production/demo bootstrap CLI.
 * Does not start the HTTP or GraphQL server.
 *
 * synchronize is forced ON for this CLI only so MongoDB indexes from entity
 * metadata are created/reconciled against Atlas (API runtime keeps synchronize false).
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
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbHost = configService.get<string>('DB_HOST')
        const dbName = configService.get<string>('DB_NAME')

        if (!dbHost || !dbName) {
          throw new Error('MongoDB configuration is missing (DB_HOST, DB_NAME)')
        }

        const url = buildMongoUrl(dbHost, dbName)
        Logger.log(
          `Bootstrap connecting to MongoDB host ${safeMongoHostname(dbHost)} (database: ${dbName})`,
        )
        Logger.log(
          'Bootstrap TypeORM synchronize=true (CLI only — creates/reconciles indexes)',
        )

        return {
          type: 'mongodb' as const,
          url,
          synchronize: true,
          autoLoadEntities: true,
        }
      },
    }),
    SeedModule,
  ],
})
export class BootstrapAppModule {}
