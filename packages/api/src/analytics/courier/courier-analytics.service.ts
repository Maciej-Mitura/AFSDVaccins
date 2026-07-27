import { Inject, Injectable, Logger } from '@nestjs/common'

import { ApplicationCacheService } from '../../common/cache/application-cache.service'
import { CacheKeys } from '../../common/cache/cache-keys'
import { CLOCK, type Clock } from '../../order/clock.provider'
import { getLocalCalendarDate } from '../../order/delivery-date.util'
import { SettingsService } from '../../settings/settings.service'
import { DEFAULT_TIMEZONE } from '../../settings/settings.constants'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { CourierAnalyticsAuditService } from './courier-analytics-audit.service'
import { calculateCourierPerformanceAnalytics } from './courier-analytics.calculator'
import {
  COURIER_ANALYTICS_CACHE_TTL_MS,
  COURIER_ANALYTICS_CSV_CACHE_CONTROL,
  COURIER_ANALYTICS_CSV_CONTENT_TYPE,
  COURIER_ANALYTICS_MAX_COURIERS,
} from './courier-analytics.constants'
import { buildCourierAnalyticsCsv } from './courier-analytics.csv'
import {
  CourierAnalyticsExportFailedException,
  CourierAnalyticsForbiddenException,
  CourierAnalyticsGenerationFailedException,
  CourierAnalyticsTooLargeException,
} from './courier-analytics.exceptions'
import { CourierAnalyticsRepository } from './courier-analytics.repository'
import type { CourierPerformanceAnalyticsResult } from './courier-analytics.types'

export type CourierAnalyticsCsvExportResult = {
  csvBytes: Buffer
  filename: string
  contentType: string
  cacheControl: string
  generatedAt: Date
  rowCount: number
}

@Injectable()
export class CourierAnalyticsService {
  private readonly logger = new Logger(CourierAnalyticsService.name)

  constructor(
    private readonly repository: CourierAnalyticsRepository,
    private readonly settingsService: SettingsService,
    private readonly cache: ApplicationCacheService,
    private readonly auditService: CourierAnalyticsAuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getCourierPerformanceAnalytics(
    actor: User,
    options: { refresh?: boolean } = {},
  ): Promise<CourierPerformanceAnalyticsResult> {
    this.assertAdmin(actor)

    try {
      if (options.refresh) {
        await this.cache.invalidate(CacheKeys.courierPerformanceAnalyticsAllTime())
      }

      return await this.cache.getOrSet(
        CacheKeys.courierPerformanceAnalyticsAllTime(),
        () => this.generateAnalytics(),
        COURIER_ANALYTICS_CACHE_TTL_MS,
      )
    } catch (error) {
      if (
        error instanceof CourierAnalyticsForbiddenException ||
        error instanceof CourierAnalyticsTooLargeException
      ) {
        throw error
      }
      this.logger.error(
        'Courier analytics generation failed.',
        error instanceof Error ? error.message : 'unknown',
      )
      throw new CourierAnalyticsGenerationFailedException()
    }
  }

  async exportCourierPerformanceCsv(
    actor: User,
  ): Promise<CourierAnalyticsCsvExportResult> {
    this.assertAdmin(actor)

    let analytics: CourierPerformanceAnalyticsResult
    try {
      analytics = await this.getCourierPerformanceAnalytics(actor)
    } catch (error) {
      if (
        error instanceof CourierAnalyticsForbiddenException ||
        error instanceof CourierAnalyticsTooLargeException ||
        error instanceof CourierAnalyticsGenerationFailedException
      ) {
        throw error
      }
      throw new CourierAnalyticsExportFailedException()
    }

    let csvPayload: ReturnType<typeof buildCourierAnalyticsCsv>
    try {
      csvPayload = buildCourierAnalyticsCsv(analytics)
    } catch (error) {
      this.logger.error(
        'Courier analytics CSV build failed.',
        error instanceof Error ? error.message : 'unknown',
      )
      throw new CourierAnalyticsExportFailedException()
    }

    try {
      await this.auditService.recordExport({
        actorUserId: String(actor._id),
        generatedAt: analytics.generatedAt,
        rowCount: csvPayload.rowCount,
      })
    } catch {
      // Failed export must not claim success via audit — rethrow as export failure.
      throw new CourierAnalyticsExportFailedException()
    }

    return {
      csvBytes: Buffer.from(csvPayload.csv, 'utf8'),
      filename: csvPayload.filename,
      contentType: COURIER_ANALYTICS_CSV_CONTENT_TYPE,
      cacheControl: COURIER_ANALYTICS_CSV_CACHE_CONTROL,
      generatedAt: analytics.generatedAt,
      rowCount: csvPayload.rowCount,
    }
  }

  private async generateAnalytics(): Promise<CourierPerformanceAnalyticsResult> {
    const dataset = await this.repository.loadAllTimeDataset()

    if (dataset.couriers.length > COURIER_ANALYTICS_MAX_COURIERS) {
      throw new CourierAnalyticsTooLargeException()
    }

    const settings = await this.settingsService.getApplicationSettings()
    const timeZone = settings?.timezone || DEFAULT_TIMEZONE
    const now = this.clock.now()
    const todayLocalDate = getLocalCalendarDate(now, timeZone)

    return calculateCourierPerformanceAnalytics({
      routes: dataset.routes,
      couriers: dataset.couriers,
      zeroRouteBezorgerProfileCount: dataset.zeroRouteBezorgerProfileCount,
      todayLocalDate,
      timeZone,
      generatedAt: now,
    })
  }

  private assertAdmin(actor: User): void {
    if (actor.role !== UserRole.ADMIN) {
      throw new CourierAnalyticsForbiddenException()
    }
  }
}
