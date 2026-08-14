import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { DatabaseResetAppModule } from './seed/database-reset-app.module'
import { DatabaseResetSafetyError } from './seed/database-reset.safety'
import { DatabaseResetService } from './seed/database-reset.service'

/**
 * Local exam/demo Mongo application-database reset.
 * Never invoked by Docker CMD, Railway deploy, or API startup.
 * Does not touch Firebase Authentication.
 *
 * Gates: NODE_ENV=development, ALLOW_DATABASE_RESET=true, and
 * CONFIRM_DATABASE_RESET=RESET_LOCAL_DEMO_DATABASE
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('DatabaseResetCLI')

  const app = await NestFactory.createApplicationContext(
    DatabaseResetAppModule,
    {
      logger: ['error', 'warn', 'log'],
    },
  )

  try {
    const resetService = app.get(DatabaseResetService)
    await resetService.run()
    await app.close()
    process.exitCode = 0
  } catch (error: unknown) {
    if (error instanceof DatabaseResetSafetyError) {
      logger.error(error.message)
    } else if (error instanceof Error) {
      logger.error(`Database reset failed: ${error.message}`)
    } else {
      logger.error('Database reset failed with an unknown error')
    }

    await app.close()
    process.exitCode = 1
  }
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('DatabaseResetCLI')
  logger.error('Database reset CLI bootstrap failed', error)
  process.exit(1)
})
