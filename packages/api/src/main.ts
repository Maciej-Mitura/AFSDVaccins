import { NestFactory } from '@nestjs/core'
import { ConsoleLogger, Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'
import { EnvConfig } from './config/env.validation'

async function generateSchemaOnly(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false })
  await app.init()
  await app.close()
  Logger.log('GraphQL schema generated at dist/schema.gql')
}

async function bootstrap(): Promise<void> {
  if (process.argv.includes('--generate-schema-only')) {
    await generateSchemaOnly()
    return
  }

  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      prefix: 'VaccinDelivery',
      logLevels:
        process.env.NODE_ENV === 'production'
          ? ['error', 'warn', 'log']
          : ['error', 'warn', 'debug', 'verbose', 'log'],
    }),
  })

  const configService = app.get(ConfigService<EnvConfig, true>)
  const port = configService.get('PORT', { infer: true })
  const frontendUrl = configService.get('URL_FRONTEND', { infer: true })

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  await app.listen(port)
  Logger.log(`Application is running on: ${await app.getUrl()}`)
  Logger.log(`GraphiQL available at: ${await app.getUrl()}/graphql`)
}

bootstrap().catch((error: unknown) => {
  Logger.error('Error during app bootstrap', error)
  process.exit(1)
})
