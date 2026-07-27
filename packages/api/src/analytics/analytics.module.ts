import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { ApplicationCacheModule } from '../common/cache/application-cache.module'
import { CLOCK, SystemClock } from '../order/clock.provider'
import { BezorgerProfile } from '../profile/bezorger/bezorger-profile.entity'
import { DeliveryRoute } from '../routes/delivery-route.entity'
import { SettingsCoreModule } from '../settings/settings-core.module'
import { UserModule } from '../user/user.module'
import { CourierAnalyticsAuditEvent } from './courier/courier-analytics-audit.entity'
import { CourierAnalyticsAuditService } from './courier/courier-analytics-audit.service'
import { CourierAnalyticsController } from './courier/courier-analytics.controller'
import { CourierAnalyticsPersistenceService } from './courier/courier-analytics.persistence'
import { CourierAnalyticsRepository } from './courier/courier-analytics.repository'
import { CourierAnalyticsResolver } from './courier/courier-analytics.resolver'
import { CourierAnalyticsService } from './courier/courier-analytics.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const emptyAnalytics = {
  generatedAt: new Date('2026-01-01T00:00:00.000Z'),
  summary: {
    courierCount: 0,
    couriersWithEligibleData: 0,
    currentBezorgerProfilesWithZeroRoutes: 0,
    totalAssignedRoutes: 0,
    totalCompletedRoutes: 0,
    totalCancelledRoutes: 0,
    totalDeliveredStops: 0,
    totalDeliveredOrders: 0,
    totalDeliveredVaccineQuantity: 0,
    overallRouteCompletionRate: null,
    overallDeliveryCompletionRate: null,
    overallOnTimeRate: null,
    overallQrConfirmationRate: null,
    averageReliabilityScore: null,
    medianReliabilityScore: null,
    highestReliabilityScore: null,
    topCourier: null,
  },
  courierRankings: [],
  monthlyActivity: [],
  routeStatusDistribution: [],
  deliveryTimelinessDistribution: [],
  deliveryProofDistribution: [],
  dataQuality: {
    legacyRoutesWithoutRequiredFields: 0,
    deliveredStopsWithoutTimestamp: 0,
    invalidStopSequences: 0,
    missingOrders: 0,
    invalidHandlingDurations: 0,
    malformedProofs: 0,
  },
}

const courierAnalyticsServiceProvider = isSchemaGeneration
  ? {
      provide: CourierAnalyticsService,
      useValue: {
        getCourierPerformanceAnalytics: () => Promise.resolve(emptyAnalytics),
        exportCourierPerformanceCsv: () =>
          Promise.resolve({
            csvBytes: Buffer.from(''),
            filename: 'courier-performance-all-time.csv',
            contentType: 'text/csv; charset=utf-8',
            cacheControl: 'private, no-store',
            generatedAt: new Date('2026-01-01T00:00:00.000Z'),
            rowCount: 0,
          }),
      },
    }
  : CourierAnalyticsService

const courierAnalyticsRepositoryProvider = isSchemaGeneration
  ? {
      provide: CourierAnalyticsRepository,
      useValue: {
        loadAllTimeDataset: () =>
          Promise.resolve({
            routes: [],
            couriers: [],
            zeroRouteBezorgerProfileCount: 0,
          }),
      },
    }
  : CourierAnalyticsRepository

const courierAnalyticsAuditServiceProvider = isSchemaGeneration
  ? {
      provide: CourierAnalyticsAuditService,
      useValue: {
        recordExport: () => Promise.resolve(),
      },
    }
  : CourierAnalyticsAuditService

const courierAnalyticsPersistenceProvider = isSchemaGeneration
  ? {
      provide: CourierAnalyticsPersistenceService,
      useValue: {
        onModuleInit: () => Promise.resolve(),
        ensureIndexes: () => Promise.resolve(),
      },
    }
  : CourierAnalyticsPersistenceService

const persistenceImports = isSchemaGeneration
  ? []
  : [
      TypeOrmModule.forFeature([
        DeliveryRoute,
        BezorgerProfile,
        CourierAnalyticsAuditEvent,
      ]),
    ]

@Module({
  imports: [
    AuthenticationModule,
    UserModule,
    ApplicationCacheModule,
    SettingsCoreModule,
    ...persistenceImports,
  ],
  controllers: isSchemaGeneration ? [] : [CourierAnalyticsController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    courierAnalyticsServiceProvider,
    courierAnalyticsRepositoryProvider,
    courierAnalyticsAuditServiceProvider,
    courierAnalyticsPersistenceProvider,
    CourierAnalyticsResolver,
  ],
  exports: [CourierAnalyticsService],
})
export class AnalyticsModule {}
