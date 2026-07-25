import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { DeliveryQrPreviewThrottle } from '../../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryQrPreviewBodyDto } from './delivery-qr-preview.dto'
import type { DeliveryQrPreviewResponseDto } from './delivery-qr-preview.dto'
import { DeliveryQrPreviewService } from './delivery-qr-preview.service'

/**
 * Authenticated courier QR scan preview (Phase 26C).
 *
 * POST body carries the opaque token — never put the token in the URL or
 * query string. Read-only: does not consume or mutate.
 */
@Controller('delivery-routes')
export class DeliveryQrPreviewController {
  constructor(private readonly previewService: DeliveryQrPreviewService) {}

  @Post('qr/preview')
  @HttpCode(200)
  @UseGuards(
    AuthorizationGuard,
    RolesGuard,
    StrictIdentityThrottlerGuard,
  )
  @DeliveryQrPreviewThrottle()
  @Roles(UserRole.BEZORGER)
  async preview(
    @Body() body: DeliveryQrPreviewBodyDto,
    @CurrentUser() user: User,
  ): Promise<DeliveryQrPreviewResponseDto> {
    return this.previewService.previewForCourier(user, body)
  }
}
