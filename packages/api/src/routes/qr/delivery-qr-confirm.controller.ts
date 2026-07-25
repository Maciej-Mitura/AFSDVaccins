import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { DeliveryQrConfirmThrottle } from '../../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryQrConfirmBodyDto } from './delivery-qr-confirm.dto'
import type { DeliveryQrConfirmResponseDto } from './delivery-qr-confirm.dto'
import { DeliveryQrConfirmService } from './delivery-qr-confirm.service'

/**
 * Authenticated courier QR delivery confirmation (Phase 26D).
 *
 * POST body carries the opaque token — never put the token in the URL or
 * query string. Mutating: consumes QR, writes proof, marks stop orders delivered.
 */
@Controller('delivery-routes')
export class DeliveryQrConfirmController {
  constructor(private readonly confirmService: DeliveryQrConfirmService) {}

  @Post('qr/confirm')
  @HttpCode(200)
  @UseGuards(
    AuthorizationGuard,
    RolesGuard,
    StrictIdentityThrottlerGuard,
  )
  @DeliveryQrConfirmThrottle()
  @Roles(UserRole.BEZORGER)
  async confirm(
    @Body() body: DeliveryQrConfirmBodyDto,
    @CurrentUser() user: User,
  ): Promise<DeliveryQrConfirmResponseDto> {
    return this.confirmService.confirmForCourier(user, body)
  }
}
