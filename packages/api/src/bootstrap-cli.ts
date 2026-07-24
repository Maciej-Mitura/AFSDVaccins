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
 *
 * Write timing:
 * - Nest application construction (TypeORM connect + optional synchronize/indexes)
 *   happens before SeedService.runBootstrap().
 * - Intentional Firebase Auth and Mongo demo writes start only after
 *   createApplicationContext succeeds and bootstrap gates pass.
 * - A DI failure during construction means no intentional seed writes ran;
 *   TypeORM synchronize may still have created/reconciled indexes. Reruns are
 *   idempotent (Firebase users and Mongo documents are reused/updated safely).
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('BootstrapCLI')

  logger.log('Bootstrap phase: constructing Nest application context')
  const app = await NestFactory.createApplicationContext(BootstrapAppModule, {
    logger: ['error', 'warn', 'log'],
  })
  logger.log(
    'Bootstrap phase: application context ready (DB connected; indexes may already be reconciled)',
  )

  try {
    const seedService = app.get(SeedService)
    await seedService.runBootstrap()
    logger.log('Bootstrap phase: completed successfully')
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

    logger.error(
      'Bootstrap phase: failed — rerun is safe (idempotent Firebase/Mongo reconciliation)',
    )
    await app.close()
    process.exitCode = 1
  }
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('BootstrapCLI')
  logger.error(
    'Bootstrap CLI failed during application construction (no intentional seed writes)',
    error,
  )
  process.exit(1)
})
