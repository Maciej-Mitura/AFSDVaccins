import { DataSource } from 'typeorm'

import { Notification } from '../../src/notifications/notification.entity'
import { Order } from '../../src/order/order.entity'
import { ApothekerProfile } from '../../src/profile/apotheker/apotheker-profile.entity'
import { BezorgerProfile } from '../../src/profile/bezorger/bezorger-profile.entity'
import { RouteTemplate } from '../../src/route-templates/route-template.entity'
import { DeliveryRoute } from '../../src/routes/delivery-route.entity'
import { ApplicationSettings } from '../../src/settings/settings.entity'
import { StockAdjustment } from '../../src/stock/stock-adjustment.entity'
import { User } from '../../src/user/user.entity'
import { Vaccine } from '../../src/vaccine/vaccine.entity'
import { assertSafeE2eDatabaseName } from './e2e-database.safety'

const E2E_ENTITIES = [
  Notification,
  DeliveryRoute,
  RouteTemplate,
  Order,
  StockAdjustment,
  Vaccine,
  ApplicationSettings,
  ApothekerProfile,
  BezorgerProfile,
  User,
] as const

/**
 * Deterministically clears all domain collections used by GraphQL E2E.
 * Aborts unless the connected database name contains a test marker.
 */
export async function clearE2eCollections(
  dataSource: DataSource,
  dbName: string,
): Promise<void> {
  assertSafeE2eDatabaseName(dbName)

  for (const entity of E2E_ENTITIES) {
    await dataSource.getMongoRepository(entity).clear()
  }
}

export async function countCollection(
  dataSource: DataSource,
  entity: (typeof E2E_ENTITIES)[number],
): Promise<number> {
  return dataSource.getMongoRepository(entity).count()
}
