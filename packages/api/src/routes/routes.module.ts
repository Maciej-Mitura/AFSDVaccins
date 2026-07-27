import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { PubSubModule } from '../common/pubsub/pubsub.module'
import { EnvConfig } from '../config/env.validation'
import { BusinessNotificationModule } from '../notifications/business-notification.module'
import { CLOCK, SystemClock } from '../order/clock.provider'
import { UserModule } from '../user/user.module'
import { DeliveryStopArrivalAuditEvent } from './arrival/delivery-stop-arrival-audit.entity'
import { DeliveryStopArrivalAuditPersistenceService } from './arrival/delivery-stop-arrival-audit.persistence'
import { DeliveryStopArrivalAuditService } from './arrival/delivery-stop-arrival-audit.service'
import { DeliveryStopArrivalController } from './arrival/delivery-stop-arrival.controller'
import { DeliveryStopArrivalService } from './arrival/delivery-stop-arrival.service'
import { DeliveryRouteLocationAuditEvent } from './location/delivery-route-location-audit.entity'
import { DeliveryRouteLocationAuditService } from './location/delivery-route-location-audit.service'
import { DeliveryRouteLocationFieldsResolver } from './location/delivery-route-location-fields.resolver'
import { DeliveryRouteProgressLocationService } from './location/delivery-route-progress-location.service'
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
import { AzureRouteVoiceReportStorageProvider } from './voice-report/azure-route-voice-report-storage.provider'
import { AzureRouteVoiceTranscriptionProvider } from './voice-report/azure-route-voice-transcription.provider'
import { FakeRouteVoiceReportStorageProvider } from './voice-report/fake-route-voice-report-storage.provider'
import { FakeRouteVoiceTranscriptionProvider } from './voice-report/fake-route-voice-transcription.provider'
import { RouteVoiceReportAuditEvent } from './voice-report/route-voice-report-audit.entity'
import { RouteVoiceReportAuditService } from './voice-report/route-voice-report-audit.service'
import { RouteVoiceReportController } from './voice-report/route-voice-report.controller'
import { RouteVoiceReport } from './voice-report/route-voice-report.entity'
import { RouteVoiceReportEventsService } from './voice-report/route-voice-report-events.service'
import { RouteVoiceReportResolver } from './voice-report/route-voice-report.resolver'
import { RouteVoiceReportService } from './voice-report/route-voice-report.service'
import { ROUTE_VOICE_REPORT_STORAGE_PROVIDER } from './voice-report/route-voice-report-storage.provider'
import { RouteVoiceReportTranscriptionRunner } from './voice-report/route-voice-report-transcription.runner'
import { ROUTE_VOICE_TRANSCRIPTION_PROVIDER } from './voice-report/route-voice-transcription.provider'
import { resolveVaccineImageProviderMode } from '../vaccine/image/vaccine-image-provider.selection'
import {
  ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME,
} from './voice-report/route-voice-report.constants'
import { ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS_DEFAULT } from './voice-report/route-voice-transcription.constants'

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

const deliveryRouteProgressLocationServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryRouteProgressLocationService,
      useValue: {
        recordArrivalLocation: () => Promise.resolve(null),
        recordDeliveryLocation: () => Promise.resolve(null),
        deriveNextStop: () => null,
        getSafeLocationForActor: () => null,
        getPharmacistLocationVisibility: () => ({
          isNextStop: false,
          lastKnownCourierCity: null,
          lastKnownLocationRecordedAt: null,
          courierLocationSource: null,
        }),
        buildSafeLocationStatus: () => ({
          hasLocation: false,
          city: null,
          recordedAt: null,
          source: null,
          stopSequence: null,
          hasNextStop: false,
          nextStop: null,
        }),
        recomputeRouteLocation: () => Promise.resolve(null),
      },
    }
  : DeliveryRouteProgressLocationService

const deliveryRouteLocationAuditServiceProvider = isSchemaGeneration
  ? {
      provide: DeliveryRouteLocationAuditService,
      useValue: {
        record: () => Promise.resolve({ inserted: true }),
      },
    }
  : DeliveryRouteLocationAuditService

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

const routeVoiceReportStorageProvider = {
  provide: ROUTE_VOICE_REPORT_STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<EnvConfig, true>) => {
    if (isSchemaGeneration) {
      return new FakeRouteVoiceReportStorageProvider()
    }

    const nodeEnv = configService.get('NODE_ENV', { infer: true })
    // Reuse vaccine-image storage mode: fake locally / azure in production.
    const mode = resolveVaccineImageProviderMode(
      configService.get('VACCINE_IMAGE_STORAGE_PROVIDER', { infer: true }),
      nodeEnv,
    )

    const containerName =
      configService.get('AZURE_STORAGE_ROUTE_VOICE_REPORTS_CONTAINER', {
        infer: true,
      }) ?? ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME

    if (mode === 'fake') {
      return new FakeRouteVoiceReportStorageProvider(containerName)
    }

    return AzureRouteVoiceReportStorageProvider.fromConfig({
      connectionString: configService.getOrThrow(
        'AZURE_STORAGE_CONNECTION_STRING',
        { infer: true },
      ),
      containerName,
    })
  },
}

const routeVoiceTranscriptionProvider = {
  provide: ROUTE_VOICE_TRANSCRIPTION_PROVIDER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<EnvConfig, true>) => {
    if (isSchemaGeneration) {
      return new FakeRouteVoiceTranscriptionProvider()
    }

    const mode =
      configService.get('ROUTE_VOICE_TRANSCRIPTION_PROVIDER', {
        infer: true,
      }) ?? 'fake'

    if (mode === 'fake') {
      return new FakeRouteVoiceTranscriptionProvider()
    }

    return AzureRouteVoiceTranscriptionProvider.fromConfig({
      endpoint: configService.getOrThrow('AZURE_SPEECH_ENDPOINT', {
        infer: true,
      }),
      key: configService.getOrThrow('AZURE_SPEECH_KEY', { infer: true }),
      timeoutMs:
        configService.get('ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS', {
          infer: true,
        }) ?? ROUTE_VOICE_TRANSCRIPTION_TIMEOUT_MS_DEFAULT,
    })
  },
}

const routeVoiceReportServiceProvider = isSchemaGeneration
  ? {
      provide: RouteVoiceReportService,
      useValue: {
        uploadForCourier: () => Promise.resolve(null),
        listForActor: () => Promise.resolve([]),
        streamAudioForActor: () => Promise.resolve(null),
        recoverStaleUploadingReservations: () => Promise.resolve(0),
        filterVoiceReportUpdateForSubscriber: () => Promise.resolve(false),
      },
    }
  : RouteVoiceReportService

const routeVoiceReportTranscriptionRunnerProvider = isSchemaGeneration
  ? {
      provide: RouteVoiceReportTranscriptionRunner,
      useValue: {
        onModuleInit: () => Promise.resolve(),
        recoverStaleAndPendingWork: () => Promise.resolve(0),
        enqueueLegacyAvailableReports: () => Promise.resolve(0),
        schedule: () => undefined,
        retryTranscriptionForAdmin: () =>
          Promise.resolve({
            reportId: '0',
            transcriptionStatus: 'PENDING',
          }),
      },
    }
  : RouteVoiceReportTranscriptionRunner

const routeVoiceReportAuditServiceProvider = isSchemaGeneration
  ? {
      provide: RouteVoiceReportAuditService,
      useValue: {
        recordCreated: () => Promise.resolve({ inserted: false }),
        recordTranscriptionCompleted: () =>
          Promise.resolve({ inserted: false }),
        recordTranscriptionFailed: () => Promise.resolve({ inserted: false }),
        recordTranscriptionRetried: () => Promise.resolve({ inserted: false }),
        countByReportId: () => Promise.resolve(0),
      },
    }
  : RouteVoiceReportAuditService

const routeVoiceReportEventsServiceProvider = isSchemaGeneration
  ? {
      provide: RouteVoiceReportEventsService,
      useValue: {
        publishCreated: () => Promise.resolve(),
        publishTranscriptionUpdate: () => Promise.resolve(),
      },
    }
  : RouteVoiceReportEventsService

const confirmAuditPersistence = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([DeliveryQrConfirmAuditEvent])]

const arrivalAuditPersistence = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([DeliveryStopArrivalAuditEvent])]

const locationAuditPersistence = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([DeliveryRouteLocationAuditEvent])]

const manifestAuditPersistence = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([DeliveryManifestAuditEvent])]

const voiceReportPersistence = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([RouteVoiceReport, RouteVoiceReportAuditEvent])]

@Module({
  imports: [
    ConfigModule,
    AuthenticationModule,
    UserModule,
    PubSubModule,
    RoutesCoreModule,
    BusinessNotificationModule,
    ...confirmAuditPersistence,
    ...arrivalAuditPersistence,
    ...locationAuditPersistence,
    ...manifestAuditPersistence,
    ...voiceReportPersistence,
  ],
  controllers: isSchemaGeneration
    ? []
    : [
        DeliveryQrPreviewController,
        DeliveryQrConfirmController,
        DeliveryStopQrController,
        DeliveryStopArrivalController,
        DeliveryManifestController,
        RouteVoiceReportController,
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
    deliveryRouteProgressLocationServiceProvider,
    deliveryRouteLocationAuditServiceProvider,
    deliveryManifestDataServiceProvider,
    deliveryManifestPdfServiceProvider,
    deliveryManifestServiceProvider,
    deliveryManifestAuditServiceProvider,
    routeVoiceReportStorageProvider,
    routeVoiceTranscriptionProvider,
    routeVoiceReportServiceProvider,
    routeVoiceReportTranscriptionRunnerProvider,
    routeVoiceReportAuditServiceProvider,
    routeVoiceReportEventsServiceProvider,
    DeliveryStopQrImageService,
    RoutesResolver,
    DeliveryStopQrFieldsResolver,
    DeliveryRouteLocationFieldsResolver,
    DeliveryStopQrResolver,
    RouteVoiceReportResolver,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
  ],
  exports: [
    RoutesCoreModule,
    RoutesService,
    RoutePreviewService,
    DeliveryRouteProgressLocationService,
    RouteVoiceReportService,
    RouteVoiceReportTranscriptionRunner,
  ],
})
export class RoutesModule {}
