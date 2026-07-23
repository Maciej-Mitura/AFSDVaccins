import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Logger, type INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { getDataSourceToken } from '@nestjs/typeorm'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { Request, Response } from 'express'
import { DataSource } from 'typeorm'

import {
  configureApiApp,
  createApiNestFactoryOptions,
} from '../common/bootstrap/configure-api-app'
import type { PlaywrightSeedSummary } from './browser-fixtures'
import {
  PLAYWRIGHT_API_PORT,
  PLAYWRIGHT_DB_NAME,
  PLAYWRIGHT_PWA_PORT,
} from './playwright-constants'

const logger = new Logger('PlaywrightApiStack')

type RuntimeInfo = {
  apiPort: number
  apiBaseUrl: string
  pwaPort: number
  dbHost: string
  dbName: string
  seed: PlaywrightSeedSummary
}

function applyPlaywrightEnv(dbHost: string): void {
  process.env.NODE_ENV = 'test'
  process.env.ALLOW_E2E_AUTH_BYPASS = 'true'
  process.env.ALLOW_DATABASE_SEED = 'false'
  process.env.PORT = String(PLAYWRIGHT_API_PORT)
  process.env.URL_FRONTEND = `http://127.0.0.1:${PLAYWRIGHT_PWA_PORT}`
  process.env.DB_HOST = dbHost
  process.env.DB_NAME = PLAYWRIGHT_DB_NAME
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS
  delete process.env.GENERATE_SCHEMA_ONLY
}

function writeRuntimeFile(info: RuntimeInfo): void {
  const target = join(process.cwd(), 'test', '.playwright-api-runtime.json')
  writeFileSync(target, JSON.stringify(info, null, 2))
  logger.log(`Wrote Playwright runtime file: ${target}`)
}

function attachE2eResetRoutes(
  app: INestApplication,
  dataSource: DataSource,
  seedFixtures: (ds: DataSource) => Promise<PlaywrightSeedSummary>,
  runtimeRef: { seed: PlaywrightSeedSummary },
): void {
  const expressApp = app.getHttpAdapter().getInstance() as {
    get: (
      path: string,
      handler: (req: Request, res: Response) => void,
    ) => void
    post: (
      path: string,
      handler: (req: Request, res: Response) => void | Promise<void>,
    ) => void
  }

  expressApp.get('/__e2e__/health', (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      service: 'playwright-api',
      dbName: PLAYWRIGHT_DB_NAME,
    })
  })

  expressApp.post('/__e2e__/reset', async (_req: Request, res: Response) => {
    try {
      runtimeRef.seed = await seedFixtures(dataSource)
      res.status(200).json({ ok: true, seed: runtimeRef.seed })
    } catch (error: unknown) {
      logger.error('Playwright fixture reset failed', error)
      res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'Reset failed',
      })
    }
  })
}

async function bootstrap(): Promise<void> {
  const mongoServer = await MongoMemoryServer.create()
  const dbHost = mongoServer.getUri().replace(/\/$/, '')

  // Env must be set before AppModule is loaded (ConfigModule validates at import).
  applyPlaywrightEnv(dbHost)

  const { AppModule } = await import('../app.module.js')
  const { seedPlaywrightBrowserFixtures } = await import('./browser-fixtures.js')

  const app = await NestFactory.create(
    AppModule,
    createApiNestFactoryOptions(process.env),
  )
  configureApiApp(app, { enableListenLogging: false })

  const dataSource = app.get<DataSource>(getDataSourceToken())
  const seed = await seedPlaywrightBrowserFixtures(dataSource)
  const runtimeRef = { seed }

  attachE2eResetRoutes(
    app,
    dataSource,
    seedPlaywrightBrowserFixtures,
    runtimeRef,
  )

  await app.listen(PLAYWRIGHT_API_PORT)

  const runtime: RuntimeInfo = {
    apiPort: PLAYWRIGHT_API_PORT,
    apiBaseUrl: `http://localhost:${PLAYWRIGHT_API_PORT}`,
    pwaPort: PLAYWRIGHT_PWA_PORT,
    dbHost,
    dbName: PLAYWRIGHT_DB_NAME,
    seed,
  }

  writeRuntimeFile(runtime)
  logger.log(
    `Playwright API listening on http://127.0.0.1:${PLAYWRIGHT_API_PORT}`,
  )
  logger.log(`Isolated DB: ${PLAYWRIGHT_DB_NAME}`)
  logger.log('PLAYWRIGHT_API_READY')

  const shutdown = async (): Promise<void> => {
    logger.log('Shutting down Playwright API stack…')
    await app.close()
    await mongoServer.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void shutdown()
  })
  process.on('SIGTERM', () => {
    void shutdown()
  })
}

bootstrap().catch((error: unknown) => {
  logger.error('Failed to start Playwright API stack', error)
  process.exit(1)
})
