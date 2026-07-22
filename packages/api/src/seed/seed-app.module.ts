import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { buildMongoUrl, envValidationSchema, safeMongoHostname } from '../config/env.validation'
import { SeedModule } from './seed.module'

/**
 * Lean Nest context for the seed CLI — Config + MongoDB + domain seed only.
 * Does not start the HTTP or GraphQL server.
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
        const nodeEnv = configService.get<string>('NODE_ENV', 'development')
        const dbHost = configService.get<string>('DB_HOST')
        const dbName = configService.get<string>('DB_NAME')

        if (!dbHost || !dbName) {
          throw new Error('MongoDB configuration is missing (DB_HOST, DB_NAME)')
        }

        const url = buildMongoUrl(dbHost, dbName)
        Logger.log(
          `Seed connecting to MongoDB host ${safeMongoHostname(dbHost)} (database: ${dbName})`,
        )

        return {
          type: 'mongodb' as const,
          url,
          synchronize: nodeEnv === 'development',
          autoLoadEntities: true,
        }
      },
    }),
    SeedModule,
  ],
})
export class SeedAppModule {}
