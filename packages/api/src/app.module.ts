import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Request, Response } from 'express'
import { join } from 'node:path'
import { buildMongoUrl, envValidationSchema } from './config/env.validation'
import { AuthenticationModule } from './authentication/authentication.module'
import { HealthModule } from './health/health.module'
import { SettingsModule } from './settings/settings.module'
import { UserModule } from './user/user.module'
import { VaccineModule } from './vaccine/vaccine.module'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const sharedImports = [
  ConfigModule.forRoot({
    isGlobal: true,
    envFilePath: ['.env'],
    validationSchema: envValidationSchema,
    validationOptions: {
      abortEarly: false,
      convert: true,
    },
  }),

  GraphQLModule.forRootAsync<ApolloDriverConfig>({
    driver: ApolloDriver,
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (configService: ConfigService) => {
      const nodeEnv = configService.get<string>('NODE_ENV', 'development')
      const isProduction = nodeEnv === 'production'

      return {
        autoSchemaFile: join(process.cwd(), 'dist/schema.gql'),
        sortSchema: true,
        graphiql: !isProduction,
        context: ({ req, res }: { req: Request; res: Response }) => ({
          req,
          res,
        }),
      }
    },
  }),
]

const databaseImports = isSchemaGeneration
  ? []
  : [
      TypeOrmModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const nodeEnv = configService.get<string>('NODE_ENV', 'development')
          const dbHost = configService.get<string>('DB_HOST')
          const dbName = configService.get<string>('DB_NAME')

          if (!dbHost || !dbName) {
            throw new Error(
              'MongoDB configuration is missing (DB_HOST, DB_NAME)',
            )
          }

          const url = buildMongoUrl(dbHost, dbName)
          Logger.log(`Connecting to MongoDB at ${dbHost} (database: ${dbName})`)

          return {
            type: 'mongodb' as const,
            url,
            synchronize: nodeEnv === 'development',
            autoLoadEntities: true,
          }
        },
      }),
    ]

@Module({
  imports: [
    ...sharedImports,
    ...databaseImports,
    HealthModule,
    AuthenticationModule,
    UserModule,
    SettingsModule,
    VaccineModule,
  ],
})
export class AppModule {}
