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

        const options = buildTypeOrmMongoOptions({
          dbHost: dbHost ?? '',
          dbName: dbName ?? '',
          synchronize: nodeEnv === 'development',
        })

        Logger.log(`MongoDB selected database: ${options.database}`)
        Logger.log(`MongoDB host scheme: ${safeMongoScheme(dbHost ?? '')}`)

        return options
      },
    }),
    SeedModule,
  ],
})
export class SeedAppModule {}
