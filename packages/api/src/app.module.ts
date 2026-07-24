import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { TypeOrmModule } from '@nestjs/typeorm'
import { join } from 'node:path'
import { EnvConfig, envValidationSchema } from './config/env.validation'
import {
  buildTypeOrmMongoOptions,
  safeMongoScheme,
} from './config/mongo-connection'
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
import { ApplicationCacheModule } from './common/cache/application-cache.module'
import {
  createComplexityApolloPlugin,
  createMaxDepthRule,
} from './common/graphql/query-protection'
import { PubSubModule } from './common/pubsub/pubsub.module'
import { ThrottlingModule } from './common/throttling/throttling.module'
import { HealthModule } from './health/health.module'
import { NotificationsModule } from './notifications/notifications.module'
import { OrderModule } from './order/order.module'
import { ProfileModule } from './profile/profile.module'
import { RouteTemplatesModule } from './route-templates/route-templates.module'
import { RoutesModule } from './routes/routes.module'
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
    // GraphQL E2E sets process.env explicitly; never load developer .env in test.
    ignoreEnvFile: process.env.NODE_ENV === 'test',
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
      configService: ConfigService<EnvConfig, true>,
      graphqlWsAuthService: GraphqlWsAuthService,
    ) => {
      const nodeEnv = configService.get('NODE_ENV', { infer: true })
      const isProduction = nodeEnv === 'production'
      const maxDepth = configService.get('GRAPHQL_MAX_DEPTH', { infer: true })
      const maxComplexity = configService.get('GRAPHQL_MAX_COMPLEXITY', {
        infer: true,
      })

      return {
        autoSchemaFile: join(process.cwd(), 'dist/schema.gql'),
        sortSchema: true,
        graphiql: !isProduction,
        // Apollo HTTP batching is NOT enabled (allowBatchedHttpRequests unset/false).
        // Each POST /graphql carries a single operation document.
        validationRules: [createMaxDepthRule(maxDepth)],
        plugins: [createComplexityApolloPlugin(maxComplexity)],
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

          // synchronize in development and isolated GraphQL E2E (NODE_ENV=test).
          // E2E bootstraps must assert DB_NAME contains a test marker before connect.
          // Production keeps synchronize false — empty Atlas is tolerated until bootstrap.
          const options = buildTypeOrmMongoOptions({
            dbHost: dbHost ?? '',
            dbName: dbName ?? '',
            synchronize: nodeEnv === 'development' || nodeEnv === 'test',
          })

          Logger.log(`MongoDB selected database: ${options.database}`)
          Logger.log(`MongoDB host scheme: ${safeMongoScheme(dbHost ?? '')}`)

          return options
        },
      }),
    ]

@Module({
  imports: [
    ...sharedImports,
    ...databaseImports,
    ApplicationCacheModule,
    ThrottlingModule,
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
    RouteTemplatesModule,
    RoutesModule,
  ],
})
export class AppModule {}
