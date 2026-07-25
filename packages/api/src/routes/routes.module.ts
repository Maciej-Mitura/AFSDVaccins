import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { PubSubModule } from '../common/pubsub/pubsub.module'
import { CLOCK, SystemClock } from '../order/clock.provider'
import { UserModule } from '../user/user.module'
import { DeliveryQrPreviewController } from './qr/delivery-qr-preview.controller'
import { DeliveryQrPreviewService } from './qr/delivery-qr-preview.service'
import { DeliveryStopQrController } from './qr/delivery-stop-qr.controller'
import { DeliveryStopQrFieldsResolver } from './qr/delivery-stop-qr-fields.resolver'
import { DeliveryStopQrImageService } from './qr/delivery-stop-qr-image.service'
import { DeliveryStopQrResolver } from './qr/delivery-stop-qr.resolver'
import { DeliveryStopQrRetrievalService } from './qr/delivery-stop-qr-retrieval.service'
import { RoutePreviewService } from './route-preview.service'
import { RoutesCoreModule } from './routes-core.module'
import { RoutesResolver } from './routes.resolver'
import { RoutesService } from './routes.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const routePreviewServiceProvider = isSchemaGeneration
  ? {
      provide: RoutePreviewService,
      useValue: {
        computeTomorrowPreview: () =>
          Promise.resolve({
            deliveryDate: '2026-01-02',
            bezorgerProfileId: '0',
            routeTemplateId: '0',
            routeTemplateName: 'schema',
            stops: [],
            skippedApothekerProfileIds: [],
            totalStops: 0,
            totalOrders: 0,
            totalQuantity: 0,
            computedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
      },
    }
  : RoutePreviewService

const routesServiceProvider = isSchemaGeneration
  ? {
      provide: RoutesService,
      useValue: {
        generateDeliveryRoute: () => Promise.resolve(null),
        findDeliveryRoutes: () => Promise.resolve([]),
        findDeliveryRouteById: () => Promise.resolve(null),
        findMyTodayRoute: () => Promise.resolve(null),
        findMyTomorrowRoutePreview: () => Promise.resolve(null),
        updateRouteStatus: () => Promise.resolve(null),
        filterRouteUpdateForSubscriber: () => Promise.resolve(false),
      },
    }
  : RoutesService

const deliveryStopQrRetrievalServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryStopQrRetrievalService,
      useValue: {
        resolveAuthorisedEncodedToken: () => Promise.resolve(null),
        getSafeStopQrMetadata: () => Promise.resolve(null),
      },
    }
  : DeliveryStopQrRetrievalService

const deliveryQrPreviewServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryQrPreviewService,
      useValue: {
        previewForCourier: () => Promise.resolve(null),
      },
    }
  : DeliveryQrPreviewService

@Module({
  imports: [AuthenticationModule, UserModule, PubSubModule, RoutesCoreModule],
  controllers: isSchemaGeneration
    ? []
    : [DeliveryQrPreviewController, DeliveryStopQrController],
  providers: [
    routePreviewServiceProvider,
    routesServiceProvider,
    deliveryStopQrRetrievalServiceProvider,
    deliveryQrPreviewServiceProvider,
    DeliveryStopQrImageService,
    RoutesResolver,
    DeliveryStopQrFieldsResolver,
    DeliveryStopQrResolver,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
  ],
  exports: [RoutesCoreModule, RoutesService, RoutePreviewService],
})
export class RoutesModule {}
