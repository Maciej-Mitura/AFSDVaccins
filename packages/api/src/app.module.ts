import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { TypeOrmModule } from '@nestjs/typeorm'
import { join } from 'node:path'
import { buildMongoUrl, envValidationSchema } from './config/env.validation'
import { AuthenticationModule } from './authentication/authentication.module'
import { GraphqlWsContextExtra } from './authentication/firebase.types'
import {
  applyGraphqlWsAuthToContext,
  buildGraphqlContextFromHttp,
  buildGraphqlContextFromWs,
  isGraphqlWsServerContext,
} from './authentication/graphql-auth.context'
import { GraphqlWsAuthModule } from './authentication/graphql-ws-auth.module'
import { GraphqlWsAuthService } from './authentication/graphql-ws-auth.service'
import { buildGraphqlRequestFromWsAuth } from './authentication/graphql-ws-auth.util'
import { PubSubModule } from './common/pubsub/pubsub.module'
import { HealthModule } from './health/health.module'
import { NotificationsModule } from './notifications/notifications.module'
import { OrderModule } from './order/order.module'
import { ProfileModule } from './profile/profile.module'
import { SettingsModule } from './settings/settings.module'
import { UserModule } from './user/user.module'
import { StockModule } from './stock/stock.module'
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
    imports: [ConfigModule, GraphqlWsAuthModule],
    inject: [ConfigService, GraphqlWsAuthService],
    useFactory: (
      configService: ConfigService,
      graphqlWsAuthService: GraphqlWsAuthService,
    ) => {
      const nodeEnv = configService.get<string>('NODE_ENV', 'development')
      const isProduction = nodeEnv === 'production'

      return {
        autoSchemaFile: join(process.cwd(), 'dist/schema.gql'),
        sortSchema: true,
        graphiql: !isProduction,
        subscriptions: {
          'graphql-ws': {
            onConnect: async (context: {
              connectionParams?: Record<string, unknown>
              extra: unknown
            }) => {
              try {
                const auth = await graphqlWsAuthService.authenticateConnection(
                  context.connectionParams,
                )

                applyGraphqlWsAuthToContext(
                  {
                    extra: context.extra as GraphqlWsContextExtra,
                  },
                  buildGraphqlRequestFromWsAuth(auth),
                )

                return true
              } catch {
                return false
              }
            },
          },
        },
        context: (ctxOrReq: unknown) => {
          if (isGraphqlWsServerContext(ctxOrReq)) {
            return buildGraphqlContextFromWs(ctxOrReq)
          }

          return buildGraphqlContextFromHttp(ctxOrReq)
        },
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
    PubSubModule,
    HealthModule,
    AuthenticationModule,
    UserModule,
    ProfileModule,
    SettingsModule,
    VaccineModule,
    StockModule,
    NotificationsModule,
    OrderModule,
  ],
})
export class AppModule {}
