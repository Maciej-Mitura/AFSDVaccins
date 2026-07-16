import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { PubSubModule } from '../common/pubsub/pubsub.module'
import { OrderModule } from '../order/order.module'
import { ProfileModule } from '../profile/profile.module'
import { RouteTemplatesModule } from '../route-templates/route-templates.module'
import { SettingsModule } from '../settings/settings.module'
import { UserModule } from '../user/user.module'
import { DeliveryRoute } from './delivery-route.entity'
import { DeliveryRouteEventsService } from './delivery-route-events.service'
import { RouteGenerationService } from './route-generation.service'
import { RoutesResolver } from './routes.resolver'
import { RoutesService } from './routes.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const routeGenerationServiceProvider = isSchemaGeneration
  ? {
      provide: RouteGenerationService,
      useValue: {
        generateDeliveryRoute: () => Promise.resolve(null),
        getLocalTodayDeliveryDate: () => Promise.resolve('2026-01-01'),
        findByBezorgerAndDate: () => Promise.resolve(null),
      },
    }
  : RouteGenerationService

const routesServiceProvider = isSchemaGeneration
  ? {
      provide: RoutesService,
      useValue: {
        generateDeliveryRoute: () => Promise.resolve(null),
        findDeliveryRoutes: () => Promise.resolve([]),
        findDeliveryRouteById: () => Promise.resolve(null),
        findMyTodayRoute: () => Promise.resolve(null),
        filterRouteUpdateForSubscriber: () => Promise.resolve(false),
      },
    }
  : RoutesService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([DeliveryRoute])]

@Module({
  imports: [
    AuthenticationModule,
    UserModule,
    ProfileModule,
    OrderModule,
    RouteTemplatesModule,
    SettingsModule,
    PubSubModule,
    ...persistenceImports,
  ],
  providers: [
    routeGenerationServiceProvider,
    routesServiceProvider,
    DeliveryRouteEventsService,
    RoutesResolver,
  ],
  exports: [RoutesService, RouteGenerationService],
})
export class RoutesModule {}
