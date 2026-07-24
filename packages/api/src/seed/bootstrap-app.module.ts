import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { envValidationSchema } from '../config/env.validation'
import {
  buildTypeOrmMongoOptions,
  safeMongoScheme,
} from '../config/mongo-connection'
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

        const options = buildTypeOrmMongoOptions({
          dbHost: dbHost ?? '',
          dbName: dbName ?? '',
          synchronize: true,
        })

        Logger.log(`MongoDB selected database: ${options.database}`)
        Logger.log(`MongoDB host scheme: ${safeMongoScheme(dbHost ?? '')}`)
        Logger.log(
          'Bootstrap TypeORM synchronize=true (CLI only — creates/reconciles indexes)',
        )

        return options
      },
    }),
    SeedModule,
  ],
})
export class BootstrapAppModule {}
