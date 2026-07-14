import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { SettingsModule } from '../settings/settings.module'
import { UserModule } from '../user/user.module'
import { VaccineModule } from '../vaccine/vaccine.module'
import { CLOCK, SystemClock } from './clock.provider'
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
      },
    }
  : OrderService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([Order])]

@Module({
  imports: [
    AuthenticationModule,
    UserModule,
    VaccineModule,
    SettingsModule,
    ...persistenceImports,
  ],
  providers: [
    orderServiceProvider,
    OrderResolver,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
  ],
  exports: [OrderService],
})
export class OrderModule {}
