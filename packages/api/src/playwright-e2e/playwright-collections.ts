import { DataSource } from 'typeorm'

import { Notification } from '../notifications/notification.entity'
import { Order } from '../order/order.entity'
import { ApothekerProfile } from '../profile/apotheker/apotheker-profile.entity'
import { BezorgerProfile } from '../profile/bezorger/bezorger-profile.entity'
import { RouteTemplate } from '../route-templates/route-template.entity'
import { DeliveryRoute } from '../routes/delivery-route.entity'
import { DeliveryQrConfirmAuditEvent } from '../routes/qr/delivery-qr-confirm-audit.entity'
import { DeliveryStopArrivalAuditEvent } from '../routes/arrival/delivery-stop-arrival-audit.entity'
import { DeliveryRouteLocationAuditEvent } from '../routes/location/delivery-route-location-audit.entity'
import { ApplicationSettings } from '../settings/settings.entity'
import { StockAdjustment } from '../stock/stock-adjustment.entity'
import { User } from '../user/user.entity'
import { Vaccine } from '../vaccine/vaccine.entity'
import { PLAYWRIGHT_DB_NAME } from './playwright-constants'

const E2E_DB_NAME_MARKERS = ['_test', 'e2e'] as const

const PLAYWRIGHT_ENTITIES = [
  Notification,
  DeliveryRoute,
  DeliveryQrConfirmAuditEvent,
  DeliveryStopArrivalAuditEvent,
  DeliveryRouteLocationAuditEvent,
  RouteTemplate,
  Order,
  StockAdjustment,
  Vaccine,
  ApplicationSettings,
  ApothekerProfile,
  BezorgerProfile,
  User,
] as const


function assertSafePlaywrightDatabaseName(dbName: string): void {
  const normalized = dbName.trim().toLowerCase()
  const safe = E2E_DB_NAME_MARKERS.some(marker => normalized.includes(marker))

  if (!safe) {
    throw new Error(
      `Refusing Playwright database operations: DB_NAME "${dbName}" must contain a test marker (${E2E_DB_NAME_MARKERS.join(
        ' or ',
      )}).`,
    )
  }
}

function isMissingCollectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const withCode = error as { code?: unknown; codeName?: unknown; message?: unknown }
  if (withCode.code === 26 || withCode.codeName === 'NamespaceNotFound') {
    return true
  }

  const message =
    typeof withCode.message === 'string'
      ? withCode.message
      : error instanceof Error
        ? error.message
        : ''

  return message.includes('ns does not exist') || message.includes('NamespaceNotFound')
}

/**
 * Clears Playwright domain collections.
 * Tolerates missing collections on a fresh MongoMemoryServer.
 */
export async function clearPlaywrightCollections(
  dataSource: DataSource,
): Promise<void> {
  const dbName =
    typeof dataSource.options.database === 'string'
      ? dataSource.options.database
      : PLAYWRIGHT_DB_NAME

  assertSafePlaywrightDatabaseName(dbName)

  for (const entity of PLAYWRIGHT_ENTITIES) {
    const repo = dataSource.getMongoRepository(entity)

    try {
      // Prefer deleteMany — avoids TypeORM clear()'s listIndexes on missing NS.
      await repo.delete({})
    } catch (error: unknown) {
      if (isMissingCollectionError(error)) {
        continue
      }

      try {
        await repo.clear()
      } catch (clearError: unknown) {
        if (isMissingCollectionError(clearError)) {
          continue
        }
        throw clearError
      }
    }
  }
}
