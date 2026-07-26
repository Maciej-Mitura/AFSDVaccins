import {
  Controller,
  Get,
  Header,
  Param,
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
  DELIVERY_MANIFEST_CACHE_CONTROL,
  DELIVERY_MANIFEST_CONTENT_TYPE,
} from './delivery-manifest.constants'
import { DeliveryManifestService } from './delivery-manifest.service'

/**
 * Authenticated delivery-manifest PDF download (Phase 29A).
 * Binary PDF only — no query-string tokens, no public URL, no storage.
 */
@Controller('delivery-routes')
export class DeliveryManifestController {
  constructor(private readonly manifestService: DeliveryManifestService) {}

  @Get(':routeId/manifest.pdf')
  @UseGuards(
    AuthorizationGuard,
    RolesGuard,
    StrictIdentityThrottlerGuard,
  )
  @StrictThrottle()
  @Roles(UserRole.ADMIN, UserRole.BEZORGER)
  @Header('Content-Type', DELIVERY_MANIFEST_CONTENT_TYPE)
  @Header('Cache-Control', DELIVERY_MANIFEST_CACHE_CONTROL)
  @Header('X-Content-Type-Options', 'nosniff')
  async getRouteManifestPdf(
    @Param('routeId') routeId: string,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.manifestService.generateRouteManifestPdf(
      user,
      routeId,
    )

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    )

    return new StreamableFile(result.pdfBytes, {
      type: DELIVERY_MANIFEST_CONTENT_TYPE,
      disposition: `attachment; filename="${result.filename}"`,
    })
  }

  @Get(':routeId/stops/:stopId/manifest.pdf')
  @UseGuards(
    AuthorizationGuard,
    RolesGuard,
    StrictIdentityThrottlerGuard,
  )
  @StrictThrottle()
  @Roles(UserRole.ADMIN, UserRole.BEZORGER, UserRole.APOTHEKER)
  @Header('Content-Type', DELIVERY_MANIFEST_CONTENT_TYPE)
  @Header('Cache-Control', DELIVERY_MANIFEST_CACHE_CONTROL)
  @Header('X-Content-Type-Options', 'nosniff')
  async getStopManifestPdf(
    @Param('routeId') routeId: string,
    @Param('stopId') stopId: string,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.manifestService.generateStopManifestPdf(
      user,
      routeId,
      stopId,
    )

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    )

    return new StreamableFile(result.pdfBytes, {
      type: DELIVERY_MANIFEST_CONTENT_TYPE,
      disposition: `attachment; filename="${result.filename}"`,
    })
  }
}
