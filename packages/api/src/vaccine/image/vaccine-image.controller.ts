import {
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { VaccineImageUploadThrottle } from '../../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { OverrideVaccineImageBodyDto } from './dto/override-vaccine-image.body'
import { VaccineImageLifecycleService } from './vaccine-image-lifecycle.service'
import { VaccineImageMulterExceptionFilter } from './vaccine-image-multer.filter'
import { VaccineImageOverrideDecision } from './vaccine-image-override-decision.enum'
import {
  VaccineImageDeleteResponseDto,
  VaccineImageOverrideResponseDto,
  VaccineImageUploadResponseDto,
} from './vaccine-image-response.dto'
import {
  VACCINE_IMAGE_MAX_BYTES,
  VaccineImageMissingFileException,
} from './vaccine-image-upload.exceptions'

type UploadedImageFile = {
  buffer: Buffer
  originalname?: string
  mimetype?: string
  size?: number
  fieldname?: string
}

@Controller('vaccines')
@UseFilters(VaccineImageMulterExceptionFilter)
export class VaccineImageController {
  constructor(
    private readonly lifecycleService: VaccineImageLifecycleService,
  ) {}

  /**
   * ADMIN-only multipart upload / replace.
   * Field name: `image`. Max 5 MB. JPEG/PNG/WebP only (validated by magic bytes).
   */
  @Post(':vaccineId/image')
  @HttpCode(200)
  @UseGuards(
    AuthorizationGuard,
    RolesGuard,
    StrictIdentityThrottlerGuard,
  )
  @VaccineImageUploadThrottle()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: {
        fileSize: VACCINE_IMAGE_MAX_BYTES,
        files: 1,
        fields: 0,
      },
    }),
  )
  async uploadImage(
    @Param('vaccineId') vaccineId: string,
    @UploadedFile() file: UploadedImageFile | undefined,
    @CurrentUser() user: User,
  ): Promise<VaccineImageUploadResponseDto> {
    if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
      throw new VaccineImageMissingFileException()
    }

    return this.lifecycleService.uploadOrReplace({
      vaccineId,
      actor: user,
      bytes: file.buffer,
      originalFilename: file.originalname,
      declaredMimeType: file.mimetype,
    })
  }

  /**
   * ADMIN-only delete. Idempotent when no image exists.
   * Ordering: clear metadata → invalidate caches → delete blob.
   */
  @Delete(':vaccineId/image')
  @UseGuards(
    AuthorizationGuard,
    RolesGuard,
    StrictIdentityThrottlerGuard,
  )
  @VaccineImageUploadThrottle()
  @Roles(UserRole.ADMIN)
  async deleteImage(
    @Param('vaccineId') vaccineId: string,
    @CurrentUser() user: User,
  ): Promise<VaccineImageDeleteResponseDto> {
    return this.lifecycleService.deleteImage({
      vaccineId,
      actor: user,
    })
  }

  /**
   * ADMIN-only override of AI validation (ACCEPTED or REJECTED).
   */
  @Post(':vaccineId/image/override')
  @HttpCode(200)
  @UseGuards(
    AuthorizationGuard,
    RolesGuard,
    StrictIdentityThrottlerGuard,
  )
  @VaccineImageUploadThrottle()
  @Roles(UserRole.ADMIN)
  async overrideImage(
    @Param('vaccineId') vaccineId: string,
    @Body() body: OverrideVaccineImageBodyDto,
    @CurrentUser() user: User,
  ): Promise<VaccineImageOverrideResponseDto> {
    return this.lifecycleService.overrideValidation({
      vaccineId,
      actor: user,
      decision:
        body.decision === 'ACCEPTED'
          ? VaccineImageOverrideDecision.ACCEPTED
          : VaccineImageOverrideDecision.REJECTED,
      reason: body.reason,
    })
  }
}
