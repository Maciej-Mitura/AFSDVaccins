import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { BootstrapAppModule } from './seed/bootstrap-app.module'
import { BootstrapSafetyError } from './seed/bootstrap.safety'
import { SeedService } from './seed/seed.service'

/**
 * One-off production/demo database bootstrap.
 * Never invoked by Docker CMD, Railway deploy, or API startup.
 *
 * Gates: ALLOW_DATABASE_BOOTSTRAP=true and
 * CONFIRM_DATABASE_BOOTSTRAP=BOOTSTRAP_PUBLIC_DEMO_DATABASE
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('BootstrapCLI')

  const app = await NestFactory.createApplicationContext(BootstrapAppModule, {
    logger: ['error', 'warn', 'log'],
  })

  try {
    const seedService = app.get(SeedService)
    await seedService.runBootstrap()
    await app.close()
    process.exitCode = 0
  } catch (error: unknown) {
    if (error instanceof BootstrapSafetyError) {
      logger.error(error.message)
    } else if (error instanceof Error) {
      logger.error(`Bootstrap failed: ${error.message}`)
    } else {
      logger.error('Bootstrap failed with an unknown error')
    }

    await app.close()
    process.exitCode = 1
  }
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('BootstrapCLI')
  logger.error('Bootstrap CLI bootstrap failed', error)
  process.exit(1)
})
