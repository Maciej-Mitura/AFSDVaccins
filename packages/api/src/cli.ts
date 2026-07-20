import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { SeedAppModule } from './seed/seed-app.module'
import { SeedSafetyError } from './seed/seed.safety'
import { SeedService } from './seed/seed.service'

async function bootstrap(): Promise<void> {
  const logger = new Logger('SeedCLI')

  const app = await NestFactory.createApplicationContext(SeedAppModule, {
    logger: ['error', 'warn', 'log'],
  })

  try {
    const seedService = app.get(SeedService)
    await seedService.run()
    await app.close()
    process.exitCode = 0
  } catch (error: unknown) {
    if (error instanceof SeedSafetyError) {
      logger.error(error.message)
    } else if (error instanceof Error) {
      logger.error(`Seed failed: ${error.message}`)
    } else {
      logger.error('Seed failed with an unknown error')
    }

    await app.close()
    process.exitCode = 1
  }
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('SeedCLI')
  logger.error('Seed CLI bootstrap failed', error)
  process.exit(1)
})
