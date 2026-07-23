import type { INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { AppModule } from '../../src/app.module'
import { FirebaseService } from '../../src/authentication/firebase.service'
import {
  configureApiApp,
  createApiNestFactoryOptions,
} from '../../src/common/bootstrap/configure-api-app'
import { E2E_DEFAULT_DB_NAME } from './e2e-app.constants'
import { assertSafeE2eDatabaseName } from './e2e-database.safety'
import { clearE2eCollections } from './e2e-collections'
import {
  createE2eFirebaseService,
  resetLiveFirebaseCallCount,
} from './e2e-firebase.override'

export type E2eTestApp = {
  app: INestApplication
  moduleRef: TestingModule
  dataSource: DataSource
  dbName: string
  dbHost: string
  resetDatabase: () => Promise<void>
  close: () => Promise<void>
}

function resolveConnectedDatabaseName(
  dataSource: DataSource,
  fallbackDbName: string,
): string {
  const fromOptions = dataSource.options.database
  if (typeof fromOptions === 'string' && fromOptions.length > 0) {
    return fromOptions
  }

  const url =
    'url' in dataSource.options && typeof dataSource.options.url === 'string'
      ? dataSource.options.url
      : undefined

  if (url) {
    try {
      const parsed = new URL(url)
      const pathName = parsed.pathname.replace(/^\//, '')
      if (pathName.length > 0) {
        return pathName
      }
    } catch {
      // fall through
    }
  }

  return fallbackDbName
}

/**
 * Boots the real Nest AppModule against the isolated E2E MongoDB from globalSetup.
 * Overrides only Firebase token verification — guards and Mongo lookups stay real.
 * Uses the same security bootstrap helper as main.ts
 * (`bodyParser: false` + configureApiApp Express parsers / Helmet / pipes).
 */
export async function createE2eTestApp(): Promise<E2eTestApp> {
  const dbHost = process.env.DB_HOST
  const dbName = process.env.DB_NAME ?? E2E_DEFAULT_DB_NAME

  if (!dbHost) {
    throw new Error(
      'E2E DB_HOST is missing — ensure jest globalSetup started MongoMemoryServer',
    )
  }

  assertSafeE2eDatabaseName(dbName)
  resetLiveFirebaseCallCount()

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(FirebaseService)
    .useValue(createE2eFirebaseService())
    .compile()

  const app = moduleRef.createNestApplication(createApiNestFactoryOptions())
  configureApiApp(app, { enableListenLogging: false })

  await app.init()

  const dataSource = moduleRef.get<DataSource>(getDataSourceToken())
  const connectedName = resolveConnectedDatabaseName(dataSource, dbName)
  assertSafeE2eDatabaseName(connectedName)

  const resetDatabase = async (): Promise<void> => {
    await clearE2eCollections(dataSource, connectedName)
  }

  await resetDatabase()

  return {
    app,
    moduleRef,
    dataSource,
    dbName: connectedName,
    dbHost,
    resetDatabase,
    close: async () => {
      await app.close()
    },
  }
}
