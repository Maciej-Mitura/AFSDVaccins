import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { PubSubModule } from '../common/pubsub/pubsub.module'
import { BusinessNotificationModule } from '../notifications/business-notification.module'
import { CLOCK, SystemClock } from '../order/clock.provider'
import { UserModule } from '../user/user.module'
import { DeliveryStopArrivalAuditEvent } from './arrival/delivery-stop-arrival-audit.entity'
import { DeliveryStopArrivalAuditPersistenceService } from './arrival/delivery-stop-arrival-audit.persistence'
import { DeliveryStopArrivalAuditService } from './arrival/delivery-stop-arrival-audit.service'
import { DeliveryStopArrivalController } from './arrival/delivery-stop-arrival.controller'
import { DeliveryStopArrivalService } from './arrival/delivery-stop-arrival.service'
import { DeliveryManifestAuditEvent } from './manifest/delivery-manifest-audit.entity'
import { DeliveryManifestAuditService } from './manifest/delivery-manifest-audit.service'
import { DeliveryManifestController } from './manifest/delivery-manifest.controller'
import { DeliveryManifestDataService } from './manifest/delivery-manifest-data.service'
import { DeliveryManifestPdfService } from './manifest/delivery-manifest-pdf.service'
import { DeliveryManifestService } from './manifest/delivery-manifest.service'
import { DeliveryQrConfirmAuditEvent } from './qr/delivery-qr-confirm-audit.entity'
import { DeliveryQrConfirmAuditService } from './qr/delivery-qr-confirm-audit.service'
import { DeliveryQrConfirmController } from './qr/delivery-qr-confirm.controller'
import { DeliveryQrConfirmService } from './qr/delivery-qr-confirm.service'
import { DeliveryQrPreviewController } from './qr/delivery-qr-preview.controller'
import { DeliveryQrPreviewService } from './qr/delivery-qr-preview.service'
import { DeliveryStopQrController } from './qr/delivery-stop-qr.controller'
import { DeliveryStopQrFieldsResolver } from './qr/delivery-stop-qr-fields.resolver'
import { DeliveryStopQrImageService } from './qr/delivery-stop-qr-image.service'
import { DeliveryStopQrResolver } from './qr/delivery-stop-qr.resolver'
import { DeliveryStopQrRetrievalService } from './qr/delivery-stop-qr-retrieval.service'
import { MyPlannedDeliveriesService } from './qr/my-planned-deliveries.service'
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

const myPlannedDeliveriesServiceProvider = isSchemaGeneration
  ? {
      provide: MyPlannedDeliveriesService,
      useValue: {
        listForApotheker: () => Promise.resolve([]),
      },
    }
  : MyPlannedDeliveriesService

const deliveryQrPreviewServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryQrPreviewService,
      useValue: {
        previewForCourier: () => Promise.resolve(null),
      },
    }
  : DeliveryQrPreviewService

const deliveryQrConfirmServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryQrConfirmService,
      useValue: {
        confirmForCourier: () => Promise.resolve(null),
      },
    }
  : DeliveryQrConfirmService

const deliveryQrConfirmAuditServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryQrConfirmAuditService,
      useValue: {
        record: () => Promise.resolve(),
      },
    }
  : DeliveryQrConfirmAuditService

const deliveryStopArrivalServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryStopArrivalService,
      useValue: {
        recordArrivalForCourier: () => Promise.resolve(null),
      },
    }
  : DeliveryStopArrivalService

const deliveryStopArrivalAuditServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryStopArrivalAuditService,
      useValue: {
        record: () => Promise.resolve({ inserted: true, existing: null }),
        findByActorAndKey: () => Promise.resolve(null),
      },
    }
  : DeliveryStopArrivalAuditService

const deliveryStopArrivalAuditPersistenceProvider = isSchemaGeneration
  ? {
      provide: DeliveryStopArrivalAuditPersistenceService,
      useValue: {
        onModuleInit: () => Promise.resolve(),
        ensureIndexes: () => Promise.resolve(),
      },
    }
  : DeliveryStopArrivalAuditPersistenceService

const deliveryManifestDataServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryManifestDataService,
      useValue: {
        buildRouteManifest: () => Promise.resolve(null),
        buildStopManifest: () => Promise.resolve(null),
      },
    }
  : DeliveryManifestDataService

const deliveryManifestPdfServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryManifestPdfService,
      useValue: {
        render: () => Promise.resolve(Buffer.alloc(0)),
      },
    }
  : DeliveryManifestPdfService

const deliveryManifestServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryManifestService,
      useValue: {
        generateRouteManifestPdf: () => Promise.resolve(null),
        generateStopManifestPdf: () => Promise.resolve(null),
      },
    }
  : DeliveryManifestService

const deliveryManifestAuditServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryManifestAuditService,
      useValue: {
        record: () => Promise.resolve(),
      },
    }
  : DeliveryManifestAuditService

const confirmAuditPersistence = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([DeliveryQrConfirmAuditEvent])]

const arrivalAuditPersistence = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([DeliveryStopArrivalAuditEvent])]

const manifestAuditPersistence = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([DeliveryManifestAuditEvent])]

@Module({
  imports: [
    AuthenticationModule,
    UserModule,
    PubSubModule,
    RoutesCoreModule,
    BusinessNotificationModule,
    ...confirmAuditPersistence,
    ...arrivalAuditPersistence,
    ...manifestAuditPersistence,
  ],
  controllers: isSchemaGeneration
    ? []
    : [
        DeliveryQrPreviewController,
        DeliveryQrConfirmController,
        DeliveryStopQrController,
        DeliveryStopArrivalController,
        DeliveryManifestController,
      ],
  providers: [
    routePreviewServiceProvider,
    routesServiceProvider,
    deliveryStopQrRetrievalServiceProvider,
    myPlannedDeliveriesServiceProvider,
    deliveryQrPreviewServiceProvider,
    deliveryQrConfirmServiceProvider,
    deliveryQrConfirmAuditServiceProvider,
    deliveryStopArrivalServiceProvider,
    deliveryStopArrivalAuditServiceProvider,
    deliveryStopArrivalAuditPersistenceProvider,
    deliveryManifestDataServiceProvider,
    deliveryManifestPdfServiceProvider,
    deliveryManifestServiceProvider,
    deliveryManifestAuditServiceProvider,
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
