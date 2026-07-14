import { Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Request, Response } from 'express'
import { join } from 'node:path'
import { buildMongoUrl, envValidationSchema } from './config/env.validation'
import { HealthModule } from './health/health.module'

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
        Logger.log(`Connecting to MongoDB at ${dbHost} (database: ${dbName})`)

        return {
          type: 'mongodb' as const,
          url,
          synchronize: nodeEnv === 'development',
          entities: [],
        }
      },
    }),

    HealthModule,
  ],
})
export class AppModule {}
