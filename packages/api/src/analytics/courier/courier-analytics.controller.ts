import {
  Controller,
  Get,
  Header,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { StrictThrottle } from '../../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import {
  COURIER_ANALYTICS_CSV_CACHE_CONTROL,
  COURIER_ANALYTICS_CSV_CONTENT_TYPE,
} from './courier-analytics.constants'
import { CourierAnalyticsService } from './courier-analytics.service'

/**
 * Authenticated ADMIN courier-performance CSV export (Phase 32A).
 * In-memory only — no temporary files, no public URL, no query-string tokens.
 */
@Controller('analytics/couriers')
export class CourierAnalyticsController {
  constructor(private readonly analyticsService: CourierAnalyticsService) {}

  @Get('export.csv')
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.ADMIN)
  @Header('Content-Type', COURIER_ANALYTICS_CSV_CONTENT_TYPE)
  @Header('Cache-Control', COURIER_ANALYTICS_CSV_CACHE_CONTROL)
  @Header('X-Content-Type-Options', 'nosniff')
  async exportCourierPerformanceCsv(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result =
      await this.analyticsService.exportCourierPerformanceCsv(user)

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    )

    return new StreamableFile(result.csvBytes, {
      type: COURIER_ANALYTICS_CSV_CONTENT_TYPE,
      disposition: `attachment; filename="${result.filename}"`,
    })
  }
}
