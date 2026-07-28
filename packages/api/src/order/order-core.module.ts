import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { PubSubModule } from '../common/pubsub/pubsub.module'
import { BusinessNotificationModule } from '../notifications/business-notification.module'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { ProfileCoreModule } from '../profile/profile-core.module'
import { SettingsCoreModule } from '../settings/settings-core.module'
import { StockCoreModule } from '../stock/stock-core.module'
import { UserCoreModule } from '../user/user-core.module'
import { VaccineCoreModule } from '../vaccine/vaccine-core.module'
import { CLOCK, SystemClock } from './clock.provider'
import { OrderEventsService } from './order-events.service'
import { OrderHistoryPersistenceService } from './order-history/order-history.persistence'
import { OrderHistoryService } from './order-history/order-history.service'
import { OrderNormalizationService } from './order-normalization.service'
import { Order } from './order.entity'
import { OrderService } from './order.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const orderServiceProvider = isSchemaGeneration
  ? {
      provide: OrderService,
      useValue: {
        createOrder: () => Promise.resolve(null),
        findMyOrders: () => Promise.resolve([]),
        findMyOrder: () => Promise.resolve(null),
        findMyWeeklyOrderSummary: () => Promise.resolve(null),
        findMyDailyVaccineAllowances: () => Promise.resolve(null),
        cancelOwnOrder: () => Promise.resolve(null),
        findOrders: () => Promise.resolve([]),
        findOrderById: () => Promise.resolve(null),
        updateOrderStatus: () => Promise.resolve(null),
        cancelOrder: () => Promise.resolve(null),
        getAdminDailyOrderOverview: () => Promise.resolve(null),
        getAdminWeeklyStatistics: () => Promise.resolve(null),
        findQualifyingOrdersForPharmacist: () => Promise.resolve([]),
        findQualifyingOrdersForRoute: () => Promise.resolve([]),
        planOrdersForGeneratedRoute: () => Promise.resolve([]),
        publishPlannedOrderUpdates: () => Promise.resolve(),
      },
    }
  : OrderService

const orderNormalizationProvider = isSchemaGeneration
  ? {
      provide: OrderNormalizationService,
      useValue: {
        normalizeOrderIfNeeded: (order: Order) => Promise.resolve(order),
        normalizeOrdersIfNeeded: (orders: Order[]) => Promise.resolve(orders),
      },
    }
  : OrderNormalizationService

const orderHistoryServiceProvider = isSchemaGeneration
  ? {
      provide: OrderHistoryService,
      useValue: {
        findOrderHistory: () =>
          Promise.resolve({
            edges: [],
            pageInfo: { hasNextPage: false, endCursor: null },
            totalCount: 0,
          }),
      },
    }
  : OrderHistoryService

const orderHistoryPersistenceProvider = isSchemaGeneration
  ? {
      provide: OrderHistoryPersistenceService,
      useValue: {
        onModuleInit: () => Promise.resolve(),
        ensureIndexes: () => Promise.resolve(),
      },
    }
  : OrderHistoryPersistenceService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([Order])]

@Module({
  imports: [
    PubSubModule,
    VaccineCoreModule,
    SettingsCoreModule,
    NotificationsCoreModule,
    BusinessNotificationModule,
    StockCoreModule,
    UserCoreModule,
    ProfileCoreModule,
    ...persistenceImports,
  ],
  providers: [
    orderServiceProvider,
    orderNormalizationProvider,
    orderHistoryServiceProvider,
    orderHistoryPersistenceProvider,
    OrderEventsService,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
  ],
  exports: [OrderService, OrderHistoryService, ...persistenceImports],
})
export class OrderCoreModule {}
