import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'
import {
  configureApiApp,
  createApiNestFactoryOptions,
} from './common/bootstrap/configure-api-app'
import { EnvConfig } from './config/env.validation'

async function generateSchemaOnly(): Promise<void> {
  // Schema generation does not serve HTTP; still disable Nest body parsers for consistency.
  const app = await NestFactory.create(AppModule, {
    ...createApiNestFactoryOptions({ ...process.env, NODE_ENV: 'test' }),
    logger: false,
  })
  await app.init()
  await app.close()
  Logger.log('GraphQL schema generated at dist/schema.gql')
}

async function bootstrap(): Promise<void> {
  if (process.argv.includes('--generate-schema-only')) {
    await generateSchemaOnly()
    return
  }

  const app = await NestFactory.create(
    AppModule,
    createApiNestFactoryOptions(process.env),
  )

  configureApiApp(app)

  const configService = app.get(ConfigService<EnvConfig, true>)
  const port = configService.get('PORT', { infer: true })

  await app.listen(port)
  Logger.log(`Application is running on: ${await app.getUrl()}`)
  if (configService.get('NODE_ENV', { infer: true }) !== 'production') {
    Logger.log(`GraphiQL available at: ${await app.getUrl()}/graphql`)
  }
}

bootstrap().catch((error: unknown) => {
  Logger.error('Error during app bootstrap', error)
  process.exit(1)
})
