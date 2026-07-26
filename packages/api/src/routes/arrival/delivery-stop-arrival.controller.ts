import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { DeliveryStopArrivalThrottle } from '../../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryStopArrivalBodyDto } from './delivery-stop-arrival.dto'
import type { DeliveryStopArrivalResponseDto } from './delivery-stop-arrival.dto'
import { DeliveryStopArrivalService } from './delivery-stop-arrival.service'

/**
 * Authenticated courier stop arrival (Phase 28C).
 *
 * POST /delivery-routes/:routeId/stops/:stopId/arrival
 *
 * Does not consume QR, mark delivery, or change stock.
 */
@Controller('delivery-routes')
export class DeliveryStopArrivalController {
  constructor(private readonly arrivalService: DeliveryStopArrivalService) {}

  @Post(':routeId/stops/:stopId/arrival')
  @HttpCode(200)
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @DeliveryStopArrivalThrottle()
  @Roles(UserRole.BEZORGER)
  async recordArrival(
    @Param('routeId') routeId: string,
    @Param('stopId') stopId: string,
    @Body() body: DeliveryStopArrivalBodyDto,
    @CurrentUser() user: User,
  ): Promise<DeliveryStopArrivalResponseDto> {
    return this.arrivalService.recordArrivalForCourier(
      user,
      routeId,
      stopId,
      body,
    )
  }
}
