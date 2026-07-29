import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { PubSubModule } from '../common/pubsub/pubsub.module'
import { BusinessNotificationModule } from '../notifications/business-notification.module'
import { OrderCoreModule } from '../order/order-core.module'
import { ProfileCoreModule } from '../profile/profile-core.module'
import { RouteTemplatesCoreModule } from '../route-templates/route-templates-core.module'
import { SettingsCoreModule } from '../settings/settings-core.module'
import { DeliveryRoute } from './delivery-route.entity'
import { DeliveryRouteEventsService } from './delivery-route-events.service'
import { DeliveryQrModule } from './qr/delivery-qr.module'
import { RouteGenerationService } from './route-generation.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const routeGenerationServiceProvider = isSchemaGeneration
  ? {
      provide: RouteGenerationService,
      useValue: {
        generateDeliveryRoute: () => Promise.resolve(null),
        getRoutePlanningDiagnostics: () => Promise.resolve(null),
        getLocalTodayDeliveryDate: () => Promise.resolve('2026-01-01'),
        findByBezorgerAndDate: () => Promise.resolve(null),
      },
    }
  : RouteGenerationService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([DeliveryRoute])]

/**
 * Route generation + events for API and CLI bootstrap.
 * No GraphQL resolvers, previews, or HTTP guards.
 */
@Module({
  imports: [
    PubSubModule,
    ProfileCoreModule,
    OrderCoreModule,
    RouteTemplatesCoreModule,
    SettingsCoreModule,
    DeliveryQrModule,
    BusinessNotificationModule,
    ...persistenceImports,
  ],
  providers: [routeGenerationServiceProvider, DeliveryRouteEventsService],
  exports: [
    RouteGenerationService,
    DeliveryRouteEventsService,
    DeliveryQrModule,
    ProfileCoreModule,
    OrderCoreModule,
    RouteTemplatesCoreModule,
    SettingsCoreModule,
    ...persistenceImports,
  ],
})
export class RoutesCoreModule {}
