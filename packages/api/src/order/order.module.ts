import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { NotificationsModule } from '../notifications/notifications.module'
import { AuthenticationModule } from '../authentication/authentication.module'
import { SettingsModule } from '../settings/settings.module'
import { StockModule } from '../stock/stock.module'
import { UserModule } from '../user/user.module'
import { VaccineModule } from '../vaccine/vaccine.module'
import { CLOCK, SystemClock } from './clock.provider'
import { OrderEventsService } from './order-events.service'
import { OrderNormalizationService } from './order-normalization.service'
import { Order } from './order.entity'
import { OrderResolver } from './order.resolver'
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
        cancelOwnOrder: () => Promise.resolve(null),
        findOrders: () => Promise.resolve([]),
        findOrderById: () => Promise.resolve(null),
        updateOrderStatus: () => Promise.resolve(null),
        cancelOrder: () => Promise.resolve(null),
        getAdminDailyOrderOverview: () => Promise.resolve(null),
        getAdminWeeklyStatistics: () => Promise.resolve(null),
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

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([Order])]

@Module({
  imports: [
    AuthenticationModule,
    UserModule,
    VaccineModule,
    SettingsModule,
    NotificationsModule,
    StockModule,
    ...persistenceImports,
  ],
  providers: [
    orderServiceProvider,
    orderNormalizationProvider,
    OrderEventsService,
    OrderResolver,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
  ],
  exports: [OrderService],
})
export class OrderModule {}
