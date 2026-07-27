import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request, Response } from 'express'
import { memoryStorage } from 'multer'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { StrictIdentityThrottlerGuard } from '../../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import {
  ROUTE_VOICE_REPORT_CACHE_CONTROL,
  ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES,
} from './route-voice-report.constants'
import { RouteVoiceReportAudioRequiredException } from './route-voice-report.exceptions'
import { RouteVoiceReportMulterExceptionFilter } from './route-voice-report-multer.filter'
import { RouteVoiceReportService } from './route-voice-report.service'
import type {
  RouteVoiceReportUploadResponseDto,
  RouteVoiceTranscriptionRetryResponseDto,
} from './route-voice-report.type'
import { RouteVoiceReportUploadThrottle } from './route-voice-report-throttle.decorator'
import { RouteVoiceReportTranscriptionRunner } from './route-voice-report-transcription.runner'

type UploadedAudioFile = {
  buffer: Buffer
  originalname?: string
  mimetype?: string
  size?: number
  fieldname?: string
}

/**
 * Authenticated route voice-report upload + Range audio streaming (Phase 34A)
 * and ADMIN transcription retry (Phase 34B).
 *
 * POST /delivery-routes/:routeId/voice-reports
 * GET  /delivery-routes/:routeId/voice-reports/:reportId/audio
 * POST /delivery-routes/:routeId/voice-reports/:reportId/retry-transcription
 *
 * Never redirects to Azure. Never exposes blob names or SAS URLs.
 */
@Controller('delivery-routes')
@UseFilters(RouteVoiceReportMulterExceptionFilter)
export class RouteVoiceReportController {
  constructor(
    private readonly voiceReportService: RouteVoiceReportService,
    private readonly transcriptionRunner: RouteVoiceReportTranscriptionRunner,
  ) {}

  @Post(':routeId/voice-reports')
  @HttpCode(201)
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @RouteVoiceReportUploadThrottle()
  @Roles(UserRole.BEZORGER)
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: {
        fileSize: ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES,
        files: 1,
        fields: 8,
      },
    }),
  )
  async uploadVoiceReport(
    @Param('routeId') routeId: string,
    @UploadedFile() file: UploadedAudioFile | undefined,
    @Req() req: Request,
    @CurrentUser() user: User,
  ): Promise<RouteVoiceReportUploadResponseDto> {
    if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
      throw new RouteVoiceReportAudioRequiredException()
    }

    const body = (req.body ?? {}) as Record<string, unknown>

    return this.voiceReportService.uploadForCourier(user, routeId, {
      audioBytes: file.buffer,
      declaredMimeType: file.mimetype,
      clientRecordedAt: body.clientRecordedAt,
      durationSeconds: body.durationSeconds,
      selectedLocale: body.selectedLocale,
      clientUploadId: body.clientUploadId,
      browserFormatLabel: body.browserFormatLabel,
    })
  }

  @Get(':routeId/voice-reports/:reportId/audio')
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @RouteVoiceReportUploadThrottle()
  @Roles(UserRole.ADMIN, UserRole.BEZORGER)
  @Header('Cache-Control', ROUTE_VOICE_REPORT_CACHE_CONTROL)
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Accept-Ranges', 'bytes')
  async streamVoiceReportAudio(
    @Param('routeId') routeId: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const rangeHeader = req.headers.range

    try {
      const result = await this.voiceReportService.streamAudioForActor(
        user,
        routeId,
        reportId,
        typeof rangeHeader === 'string' ? rangeHeader : undefined,
        req.aborted ? AbortSignal.abort() : undefined,
      )

      const filename = `route-report-${result.sequenceNumber}.${result.fileExtension}`
      res.status(result.statusCode)
      res.setHeader('Content-Type', result.contentType)
      res.setHeader('Content-Length', String(result.contentLength))
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Cache-Control', ROUTE_VOICE_REPORT_CACHE_CONTROL)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${filename}"`,
      )

      if (result.statusCode === 206) {
        res.setHeader(
          'Content-Range',
          `bytes ${result.rangeStart}-${result.rangeEnd}/${result.totalSize}`,
        )
      }

      // Abort Azure/fake stream when the client disconnects.
      req.on('close', () => {
        if (!result.stream.destroyed) {
          result.stream.destroy()
        }
      })

      return new StreamableFile(result.stream, {
        type: result.contentType,
        disposition: `inline; filename="${filename}"`,
      })
    } catch (error: unknown) {
      // Attach Content-Range for 416 responses when totalSize is known.
      const maybeHttp = error as {
        getResponse?: () => unknown
      }
      if (typeof maybeHttp.getResponse === 'function') {
        const responseBody: unknown = maybeHttp.getResponse()
        if (
          responseBody &&
          typeof responseBody === 'object' &&
          'error' in responseBody &&
          'totalSize' in responseBody
        ) {
          const body = responseBody as {
            error?: string
            totalSize?: number
          }
          if (
            body.error === 'ROUTE_VOICE_REPORT_RANGE_INVALID' &&
            typeof body.totalSize === 'number'
          ) {
            res.setHeader('Content-Range', `bytes */${body.totalSize}`)
          }
        }
      }
      throw error
    }
  }

  @Post(':routeId/voice-reports/:reportId/retry-transcription')
  @HttpCode(202)
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @RouteVoiceReportUploadThrottle()
  @Roles(UserRole.ADMIN)
  async retryVoiceReportTranscription(
    @Param('routeId') routeId: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: User,
  ): Promise<RouteVoiceTranscriptionRetryResponseDto> {
    return this.transcriptionRunner.retryTranscriptionForAdmin(
      user,
      routeId,
      reportId,
    )
  }
}
