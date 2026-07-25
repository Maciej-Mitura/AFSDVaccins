import {
  Controller,
  Get,
  Header,
  Param,
  UseGuards,
} from '@nestjs/common'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { StrictThrottle } from '../../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import {
  DELIVERY_STOP_QR_CACHE_CONTROL,
  DELIVERY_STOP_QR_CONTENT_TYPE,
  DELIVERY_STOP_QR_FILENAME,
} from './delivery-stop-qr-image.constants'
import { DeliveryStopQrImageService } from './delivery-stop-qr-image.service'
import { DeliveryStopQrRetrievalService } from './delivery-stop-qr-retrieval.service'

/**
 * Authenticated SVG render of a generated stop QR (Phase 26B).
 * Re-checks authorisation and eligibility on every request. Read-only.
 */
@Controller('delivery-routes')
export class DeliveryStopQrController {
  constructor(
    private readonly retrievalService: DeliveryStopQrRetrievalService,
    private readonly imageService: DeliveryStopQrImageService,
  ) {}

  @Get(':routeId/stops/:stopId/qr')
  @UseGuards(
    AuthorizationGuard,
    RolesGuard,
    StrictIdentityThrottlerGuard,
  )
  @StrictThrottle()
  @Roles(UserRole.ADMIN, UserRole.APOTHEKER)
  @Header('Content-Type', DELIVERY_STOP_QR_CONTENT_TYPE)
  @Header('Cache-Control', DELIVERY_STOP_QR_CACHE_CONTROL)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header(
    'Content-Disposition',
    `inline; filename="${DELIVERY_STOP_QR_FILENAME}"`,
  )
  async getStopQrSvg(
    @Param('routeId') routeId: string,
    @Param('stopId') stopId: string,
    @CurrentUser() user: User,
  ): Promise<string> {
    const { encodedToken } =
      await this.retrievalService.resolveAuthorisedEncodedToken(
        user,
        routeId,
        stopId,
      )

    return this.imageService.renderSvg(encodedToken)
  }
}
