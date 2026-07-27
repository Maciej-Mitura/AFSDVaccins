import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { Readable } from 'node:stream'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import {
  getApplicationUser,
} from '../../authentication/graphql-auth.context'
import type { GraphqlRequestContext } from '../../authentication/firebase.types'
import { BezorgerProfileService } from '../../profile/bezorger/bezorger-profile.service'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryRoute } from '../delivery-route.entity'
import { RouteStatus } from '../route-status.enum'
import {
  buildIdempotencyFingerprint,
  generateRouteVoiceReportBlobName,
  parseBrowserFormatLabel,
  parseClientRecordedAt,
  parseClientUploadId,
  parseDurationSeconds,
  parseSelectedLocale,
  validateRouteVoiceReportAudio,
} from './route-voice-report-audio.validation'
import { RouteVoiceReportAuditService } from './route-voice-report-audit.service'
import {
  ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME,
  ROUTE_VOICE_REPORT_MAX_REPORTS_PER_ROUTE,
  ROUTE_VOICE_REPORT_STALE_UPLOADING_MS,
} from './route-voice-report.constants'
import { RouteVoiceReport } from './route-voice-report.entity'
import { RouteVoiceReportEventsService } from './route-voice-report-events.service'
import {
  RouteVoiceReportCreationFailedException,
  RouteVoiceReportForbiddenException,
  RouteVoiceReportIdempotencyConflictException,
  RouteVoiceReportLimitReachedException,
  RouteVoiceReportNotAvailableException,
  RouteVoiceReportNotFoundException,
  RouteVoiceReportRangeInvalidException,
  RouteVoiceReportRouteNotFoundException,
  RouteVoiceReportRouteNotInProgressException,
  RouteVoiceReportStorageFailedException,
  RouteVoiceReportStreamFailedException,
} from './route-voice-report.exceptions'
import { RouteVoiceReportStatus } from './route-voice-report-status.enum'
import {
  ROUTE_VOICE_REPORT_STORAGE_PROVIDER,
  type RouteVoiceReportStorageProvider,
} from './route-voice-report-storage.provider'
import type {
  RouteVoiceReportGql,
  RouteVoiceReportUploadResponseDto,
} from './route-voice-report.type'

export type ParsedByteRange =
  | { kind: 'full' }
  | { kind: 'single'; start: number; end: number }
  | { kind: 'invalid' }

export type RouteVoiceReportAudioStreamResult = {
  stream: Readable
  statusCode: 200 | 206
  contentType: string
  contentLength: number
  totalSize: number
  rangeStart: number
  rangeEnd: number
  sequenceNumber: number
  fileExtension: string
  acceptRanges: true
}

/**
 * Phase 34A route voice-report create / list / stream.
 *
 * Atomicity: Mongo and Azure are separate systems. Creation uses an explicit
 * compensation flow (UPLOADING reservation → blob upload → AVAILABLE).
 * Exact cross-system atomicity is impossible; failed finalisation deletes the
 * blob and marks UPLOAD_FAILED so listing never shows a broken report.
 */
@Injectable()
export class RouteVoiceReportService {
  private readonly logger = new Logger(RouteVoiceReportService.name)

  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly deliveryRouteRepository: MongoRepository<DeliveryRoute>,
    @InjectRepository(RouteVoiceReport)
    private readonly reportRepository: MongoRepository<RouteVoiceReport>,
    @Inject(ROUTE_VOICE_REPORT_STORAGE_PROVIDER)
    private readonly storage: RouteVoiceReportStorageProvider,
    private readonly bezorgerProfileService: BezorgerProfileService,
    private readonly auditService: RouteVoiceReportAuditService,
    private readonly eventsService: RouteVoiceReportEventsService,
  ) {}

  async uploadForCourier(
    actor: User,
    routeId: string,
    input: {
      audioBytes: Buffer
      declaredMimeType?: string | null
      clientRecordedAt: unknown
      durationSeconds: unknown
      selectedLocale?: unknown
      clientUploadId: unknown
      browserFormatLabel?: unknown
    },
  ): Promise<RouteVoiceReportUploadResponseDto> {
    if (actor.role !== UserRole.BEZORGER) {
      throw new RouteVoiceReportForbiddenException()
    }

    const parsedRouteId = tryParseGraphqlObjectId(routeId)
    if (!parsedRouteId) {
      throw new RouteVoiceReportRouteNotFoundException()
    }

    const route = await this.deliveryRouteRepository.findOne({
      where: { _id: parsedRouteId.objectId },
    })
    if (!route) {
      throw new RouteVoiceReportRouteNotFoundException()
    }

    const profile = await this.assertAssignedCourier(actor, route)
    if (route.status !== RouteStatus.IN_PROGRESS) {
      throw new RouteVoiceReportRouteNotInProgressException()
    }

    const clientUploadId = parseClientUploadId(input.clientUploadId)
    const durationSeconds = parseDurationSeconds(input.durationSeconds)
    const clientRecordedAt = parseClientRecordedAt(input.clientRecordedAt)
    const selectedLocale = parseSelectedLocale(input.selectedLocale)
    const browserFormatLabel = parseBrowserFormatLabel(input.browserFormatLabel)
    const audio = validateRouteVoiceReportAudio({
      bytes: input.audioBytes,
      declaredMimeType: input.declaredMimeType,
    })

    const fingerprint = buildIdempotencyFingerprint({
      mimeType: audio.mimeType,
      sizeBytes: audio.sizeBytes,
      durationSeconds,
      sha256: audio.sha256,
      selectedLocale,
    })

    const courierUserId = actor._id.toString()
    const routeIdStr = parsedRouteId.stringValue
    const bezorgerProfileId = profile.id.toString()

    const existing = await this.reportRepository.findOne({
      where: {
        recordedByUserId: courierUserId,
        routeId: routeIdStr,
        clientUploadId,
      },
    })

    if (existing) {
      return this.resolveIdempotentExisting({
        existing,
        fingerprint,
        routeId: routeIdStr,
        audioBytes: audio.bytes,
        mimeType: audio.mimeType,
        sha256: audio.sha256,
      })
    }

    await this.assertUnderReportLimit(routeIdStr)

    const reportObjectId = new ObjectId()
    const reportId = reportObjectId.toString()
    const blobName = generateRouteVoiceReportBlobName({
      routeId: routeIdStr,
      reportId,
      extension: audio.extension,
    })
    const containerName =
      this.storage.containerName || ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME

    const now = new Date()
    const reservation = await this.reserveReportWithSequenceRetry({
      reportObjectId,
      routeId: routeIdStr,
      bezorgerProfileId,
      recordedByUserId: courierUserId,
      blobName,
      containerName,
      mimeType: audio.mimeType,
      codec: audio.codec,
      fileExtension: audio.extension,
      sizeBytes: audio.sizeBytes,
      durationSeconds,
      sha256: audio.sha256,
      clientRecordedAt,
      uploadedAt: now,
      selectedLocale,
      browserFormatLabel,
      clientUploadId,
      idempotencyFingerprint: fingerprint,
      now,
      fingerprint,
      audioBytes: audio.bytes,
    })

    // Concurrent identical clientUploadId won the race — return that report.
    if ('response' in reservation) {
      return reservation.response
    }

    const reservedReport = reservation.report

    try {
      await this.storage.store({
        bytes: audio.bytes,
        blobName,
        mimeType: audio.mimeType,
        metadata: {
          reportid: reportId,
          // Bounded ASCII-only integrity hint (not a secret).
          sha256prefix: audio.sha256.slice(0, 16),
        },
      })
    } catch {
      await this.markUploadFailed(reservedReport)
      this.logger.warn(`voice_report_blob_upload_failed correlation=${reportId}`)
      throw new RouteVoiceReportStorageFailedException()
    }

    try {
      await this.reportRepository.updateOne(
        {
          _id: reportObjectId,
          status: RouteVoiceReportStatus.UPLOADING,
        },
        {
          $set: {
            status: RouteVoiceReportStatus.AVAILABLE,
            uploadedAt: now,
            updatedAt: new Date(),
          },
        },
      )
    } catch {
      await this.compensateBlobAfterDbFailure(blobName, reportId)
      await this.markUploadFailed(reservedReport)
      throw new RouteVoiceReportCreationFailedException()
    }

    const finalised = await this.reportRepository.findOne({
      where: { _id: reportObjectId },
    })
    if (!finalised || finalised.status !== RouteVoiceReportStatus.AVAILABLE) {
      await this.compensateBlobAfterDbFailure(blobName, reportId)
      await this.markUploadFailed(reservedReport)
      throw new RouteVoiceReportCreationFailedException()
    }

    const audit = await this.auditService.recordCreated({
      routeId: routeIdStr,
      reportId,
      sequenceNumber: finalised.sequenceNumber,
      bezorgerProfileId,
      actorUserId: courierUserId,
      durationSeconds: finalised.durationSeconds,
      sizeBytes: finalised.sizeBytes,
      mimeType: finalised.mimeType,
      selectedLocale: finalised.selectedLocale,
      createdAt: finalised.createdAt,
    })

    if (audit.inserted) {
      await this.eventsService.publishCreated({
        routeId: routeIdStr,
        reportId,
        status: RouteVoiceReportStatus.AVAILABLE,
      })
    }

    return this.toUploadResponse(finalised)
  }

  async listForActor(
    actor: User,
    routeId: string,
  ): Promise<RouteVoiceReportGql[]> {
    const { route, routeIdStr } = await this.loadRouteForRead(routeId)
    await this.assertMayReadReports(actor, route)

    const reports = await this.reportRepository.find({
      where: {
        routeId: routeIdStr,
        status: RouteVoiceReportStatus.AVAILABLE,
      },
      order: { sequenceNumber: 'ASC', createdAt: 'ASC' },
    })

    const displayName = await this.resolveRecorderDisplayName(
      route.bezorgerProfileId.toString(),
    )

    return reports
      .sort((a, b) => {
        if (a.sequenceNumber !== b.sequenceNumber) {
          return a.sequenceNumber - b.sequenceNumber
        }
        const aTime = a.createdAt?.getTime?.() ?? 0
        const bTime = b.createdAt?.getTime?.() ?? 0
        if (aTime !== bTime) {
          return aTime - bTime
        }
        return a.id.localeCompare(b.id)
      })
      .map(report => this.toGql(report, displayName))
  }

  async streamAudioForActor(
    actor: User,
    routeId: string,
    reportId: string,
    rangeHeader: string | undefined,
    abortSignal?: AbortSignal,
  ): Promise<RouteVoiceReportAudioStreamResult> {
    const { route, routeIdStr } = await this.loadRouteForRead(routeId)
    await this.assertMayReadReports(actor, route)

    const parsedReportId = tryParseGraphqlObjectId(reportId)
    if (!parsedReportId) {
      throw new RouteVoiceReportNotFoundException()
    }

    const report = await this.reportRepository.findOne({
      where: { _id: parsedReportId.objectId },
    })
    if (!report || report.routeId !== routeIdStr) {
      throw new RouteVoiceReportNotFoundException()
    }
    if (report.status !== RouteVoiceReportStatus.AVAILABLE) {
      throw new RouteVoiceReportNotAvailableException()
    }

    const props = await this.storage.getProperties(report.blobName)
    if (!props || props.contentLength <= 0) {
      throw new RouteVoiceReportNotFoundException()
    }

    const totalSize = props.contentLength
    const parsedRange = parseSingleByteRange(rangeHeader, totalSize)
    if (parsedRange.kind === 'invalid') {
      throw new RouteVoiceReportRangeInvalidException(totalSize)
    }

    const offset =
      parsedRange.kind === 'full' ? 0 : parsedRange.start
    const count =
      parsedRange.kind === 'full'
        ? totalSize
        : parsedRange.end - parsedRange.start + 1

    try {
      const download = await this.storage.downloadRange({
        blobName: report.blobName,
        offset,
        count,
        abortSignal,
      })

      return {
        stream: download.stream,
        statusCode: parsedRange.kind === 'full' ? 200 : 206,
        contentType: report.mimeType,
        contentLength: download.contentLength,
        totalSize,
        rangeStart: download.rangeStart,
        rangeEnd: download.rangeEnd,
        sequenceNumber: report.sequenceNumber,
        fileExtension: report.fileExtension,
        acceptRanges: true,
      }
    } catch (error) {
      if (error instanceof RouteVoiceReportRangeInvalidException) {
        throw error
      }
      if (
        error instanceof RouteVoiceReportNotFoundException ||
        error instanceof RouteVoiceReportStorageFailedException
      ) {
        throw error
      }
      this.logger.warn('voice_report_stream_failed')
      throw new RouteVoiceReportStreamFailedException()
    }
  }

  /**
   * Recover stale UPLOADING reservations (bounded cleanup).
   * Marks them UPLOAD_FAILED and best-effort deletes any orphan blob.
   */
  async recoverStaleUploadingReservations(
    now: Date = new Date(),
  ): Promise<number> {
    const cutoff = new Date(now.getTime() - ROUTE_VOICE_REPORT_STALE_UPLOADING_MS)
    const candidates = await this.reportRepository.find({
      where: {
        status: RouteVoiceReportStatus.UPLOADING,
      },
    })
    const stale = candidates.filter(
      report => report.createdAt.getTime() < cutoff.getTime(),
    )

    let cleaned = 0
    for (const report of stale) {
      await this.markUploadFailed(report)
      try {
        await this.storage.delete(report.blobName)
      } catch {
        // Best-effort cleanup.
      }
      cleaned += 1
    }
    return cleaned
  }

  /**
   * PubSub recipient filter: ADMIN receives all; assigned BEZORGER only for their route.
   */
  async filterVoiceReportUpdateForSubscriber(
    context: GraphqlRequestContext,
    routeId: string,
  ): Promise<boolean> {
    const user = getApplicationUser(context)
    if (!user) {
      return false
    }
    if (user.role === UserRole.ADMIN) {
      return true
    }
    if (user.role !== UserRole.BEZORGER) {
      return false
    }

    const parsed = tryParseGraphqlObjectId(routeId)
    if (!parsed) {
      return false
    }
    const route = await this.deliveryRouteRepository.findOne({
      where: { _id: parsed.objectId },
    })
    if (!route) {
      return false
    }
    const profile = await this.bezorgerProfileService.findByUserId(
      user._id.toString(),
    )
    if (!profile) {
      return false
    }
    return route.bezorgerProfileId.toString() === profile.id.toString()
  }

  private async resolveIdempotentExisting(input: {
    existing: RouteVoiceReport
    fingerprint: string
    routeId: string
    audioBytes: Buffer
    mimeType: string
    sha256: string
  }): Promise<RouteVoiceReportUploadResponseDto> {
    const { existing } = input

    if (existing.idempotencyFingerprint !== input.fingerprint) {
      throw new RouteVoiceReportIdempotencyConflictException()
    }

    if (existing.status === RouteVoiceReportStatus.AVAILABLE) {
      return this.toUploadResponse(existing)
    }

    if (existing.status === RouteVoiceReportStatus.UPLOADING) {
      // Concurrent identical request: wait-style re-check once.
      const refreshed = await this.reportRepository.findOne({
        where: { _id: existing._id },
      })
      if (refreshed?.status === RouteVoiceReportStatus.AVAILABLE) {
        return this.toUploadResponse(refreshed)
      }
      if (
        refreshed &&
        Date.now() - refreshed.createdAt.getTime() >
          ROUTE_VOICE_REPORT_STALE_UPLOADING_MS
      ) {
        return this.resumeFailedOrStaleUpload({
          existing: refreshed,
          audioBytes: input.audioBytes,
          mimeType: input.mimeType,
          sha256: input.sha256,
        })
      }
      throw new RouteVoiceReportIdempotencyConflictException()
    }

    if (existing.status === RouteVoiceReportStatus.UPLOAD_FAILED) {
      return this.resumeFailedOrStaleUpload({
        existing,
        audioBytes: input.audioBytes,
        mimeType: input.mimeType,
        sha256: input.sha256,
      })
    }

    throw new RouteVoiceReportIdempotencyConflictException()
  }

  private async resumeFailedOrStaleUpload(input: {
    existing: RouteVoiceReport
    audioBytes: Buffer
    mimeType: string
    sha256: string
  }): Promise<RouteVoiceReportUploadResponseDto> {
    const { existing } = input
    const now = new Date()

    await this.reportRepository.updateOne(
      { _id: existing._id },
      {
        $set: {
          status: RouteVoiceReportStatus.UPLOADING,
          updatedAt: now,
          sha256: input.sha256,
          sizeBytes: input.audioBytes.length,
        },
      },
    )

    try {
      const exists = await this.storage.exists(existing.blobName)
      if (!exists) {
        await this.storage.store({
          bytes: input.audioBytes,
          blobName: existing.blobName,
          mimeType: input.mimeType,
          metadata: {
            reportid: existing.id,
            sha256prefix: input.sha256.slice(0, 16),
          },
        })
      }
    } catch {
      await this.markUploadFailed(existing)
      throw new RouteVoiceReportStorageFailedException()
    }

    await this.reportRepository.updateOne(
      { _id: existing._id },
      {
        $set: {
          status: RouteVoiceReportStatus.AVAILABLE,
          uploadedAt: now,
          updatedAt: now,
        },
      },
    )

    const finalised = await this.reportRepository.findOne({
      where: { _id: existing._id },
    })
    if (!finalised || finalised.status !== RouteVoiceReportStatus.AVAILABLE) {
      await this.compensateBlobAfterDbFailure(existing.blobName, existing.id)
      await this.markUploadFailed(existing)
      throw new RouteVoiceReportCreationFailedException()
    }

    const audit = await this.auditService.recordCreated({
      routeId: finalised.routeId,
      reportId: finalised.id,
      sequenceNumber: finalised.sequenceNumber,
      bezorgerProfileId: finalised.bezorgerProfileId,
      actorUserId: finalised.recordedByUserId,
      durationSeconds: finalised.durationSeconds,
      sizeBytes: finalised.sizeBytes,
      mimeType: finalised.mimeType,
      selectedLocale: finalised.selectedLocale,
      createdAt: finalised.createdAt,
    })

    if (audit.inserted) {
      await this.eventsService.publishCreated({
        routeId: finalised.routeId,
        reportId: finalised.id,
        status: RouteVoiceReportStatus.AVAILABLE,
      })
    }

    return this.toUploadResponse(finalised)
  }

  /**
   * Allocate sequence via max+1 with unique-index retry (no DeliveryRoute mutation).
   * Concurrent uploads must not share a sequenceNumber.
   */
  private async reserveReportWithSequenceRetry(input: {
    reportObjectId: ObjectId
    routeId: string
    bezorgerProfileId: string
    recordedByUserId: string
    blobName: string
    containerName: string
    mimeType: string
    codec: string | null
    fileExtension: string
    sizeBytes: number
    durationSeconds: number
    sha256: string
    clientRecordedAt: Date
    uploadedAt: Date
    selectedLocale: string | null
    browserFormatLabel: string | null
    clientUploadId: string
    idempotencyFingerprint: string
    now: Date
    fingerprint: string
    audioBytes: Buffer
  }): Promise<
    | { report: RouteVoiceReport }
    | { response: RouteVoiceReportUploadResponseDto }
  > {
    const maxAttempts = 8
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const sequenceNumber = await this.allocateSequenceNumber(input.routeId)
      try {
        const report = await this.reportRepository.save({
          _id: input.reportObjectId,
          routeId: input.routeId,
          bezorgerProfileId: input.bezorgerProfileId,
          recordedByUserId: input.recordedByUserId,
          sequenceNumber,
          status: RouteVoiceReportStatus.UPLOADING,
          blobName: input.blobName,
          containerName: input.containerName,
          mimeType: input.mimeType,
          codec: input.codec,
          fileExtension: input.fileExtension,
          sizeBytes: input.sizeBytes,
          durationSeconds: input.durationSeconds,
          sha256: input.sha256,
          clientRecordedAt: input.clientRecordedAt,
          uploadedAt: input.uploadedAt,
          selectedLocale: input.selectedLocale,
          browserFormatLabel: input.browserFormatLabel,
          clientUploadId: input.clientUploadId,
          idempotencyFingerprint: input.idempotencyFingerprint,
          createdAt: input.now,
          updatedAt: input.now,
        })
        return { report }
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          this.logger.warn(
            `voice_report_reservation_failed correlation=${input.reportObjectId.toString()}`,
          )
          throw new RouteVoiceReportCreationFailedException()
        }

        const raced = await this.reportRepository.findOne({
          where: {
            recordedByUserId: input.recordedByUserId,
            routeId: input.routeId,
            clientUploadId: input.clientUploadId,
          },
        })
        if (raced) {
          return {
            response: await this.resolveIdempotentExisting({
              existing: raced,
              fingerprint: input.fingerprint,
              routeId: input.routeId,
              audioBytes: input.audioBytes,
              mimeType: input.mimeType,
              sha256: input.sha256,
            }),
          }
        }
        // Unique sequence collision — retry with a new max+1.
      }
    }
    throw new RouteVoiceReportCreationFailedException()
  }

  private async allocateSequenceNumber(routeId: string): Promise<number> {
    const maxDoc = await this.reportRepository.find({
      where: { routeId },
      order: { sequenceNumber: 'DESC' },
      take: 1,
    })
    const max = maxDoc[0]?.sequenceNumber ?? 0
    return max + 1
  }

  private async assertUnderReportLimit(routeId: string): Promise<void> {
    const availableCount = await this.reportRepository.countBy({
      routeId,
      status: RouteVoiceReportStatus.AVAILABLE,
    })
    const uploadingCount = await this.reportRepository.countBy({
      routeId,
      status: RouteVoiceReportStatus.UPLOADING,
    })
    if (
      availableCount + uploadingCount >=
      ROUTE_VOICE_REPORT_MAX_REPORTS_PER_ROUTE
    ) {
      throw new RouteVoiceReportLimitReachedException()
    }
  }

  private async loadRouteForRead(
    routeId: string,
  ): Promise<{ route: DeliveryRoute; routeIdStr: string }> {
    const parsed = tryParseGraphqlObjectId(routeId)
    if (!parsed) {
      throw new RouteVoiceReportRouteNotFoundException()
    }
    const route = await this.deliveryRouteRepository.findOne({
      where: { _id: parsed.objectId },
    })
    if (!route) {
      throw new RouteVoiceReportRouteNotFoundException()
    }
    return { route, routeIdStr: parsed.stringValue }
  }

  private async assertMayReadReports(
    actor: User,
    route: DeliveryRoute,
  ): Promise<void> {
    if (actor.role === UserRole.ADMIN) {
      return
    }
    if (actor.role === UserRole.BEZORGER) {
      await this.assertAssignedCourier(actor, route)
      return
    }
    throw new RouteVoiceReportForbiddenException()
  }

  private async assertAssignedCourier(
    actor: User,
    route: DeliveryRoute,
  ): Promise<{ id: { toString(): string }; displayName: string }> {
    if (actor.role !== UserRole.BEZORGER) {
      throw new RouteVoiceReportForbiddenException()
    }
    const profile = await this.bezorgerProfileService.findByUserId(
      actor._id.toString(),
    )
    if (!profile) {
      throw new RouteVoiceReportForbiddenException()
    }
    if (route.bezorgerProfileId.toString() !== profile.id.toString()) {
      throw new RouteVoiceReportForbiddenException()
    }
    return profile
  }

  private async resolveRecorderDisplayName(
    bezorgerProfileId: string,
  ): Promise<string> {
    try {
      const profile =
        await this.bezorgerProfileService.findBezorgerProfileById(
          bezorgerProfileId,
        )
      return profile.displayName?.trim() || 'Courier'
    } catch {
      return 'Courier'
    }
  }

  private async markUploadFailed(report: RouteVoiceReport): Promise<void> {
    try {
      await this.reportRepository.updateOne(
        { _id: report._id },
        {
          $set: {
            status: RouteVoiceReportStatus.UPLOAD_FAILED,
            updatedAt: new Date(),
          },
        },
      )
    } catch {
      this.logger.warn('voice_report_mark_failed_update_error')
    }
  }

  private async compensateBlobAfterDbFailure(
    blobName: string,
    correlationId: string,
  ): Promise<void> {
    try {
      await this.storage.delete(blobName)
    } catch {
      this.logger.warn(
        `voice_report_blob_compensation_failed correlation=${correlationId}`,
      )
    }
  }

  private toUploadResponse(
    report: RouteVoiceReport,
  ): RouteVoiceReportUploadResponseDto {
    return {
      id: report.id,
      routeId: report.routeId,
      sequenceNumber: report.sequenceNumber,
      status: report.status,
      mimeType: report.mimeType,
      sizeBytes: report.sizeBytes,
      durationSeconds: report.durationSeconds,
      clientRecordedAt: report.clientRecordedAt.toISOString(),
      uploadedAt: report.uploadedAt.toISOString(),
      selectedLocale: report.selectedLocale,
      canPlayAudio: report.status === RouteVoiceReportStatus.AVAILABLE,
    }
  }

  private toGql(
    report: RouteVoiceReport,
    recordedByDisplayName: string,
  ): RouteVoiceReportGql {
    return {
      id: report.id,
      routeId: report.routeId,
      sequenceNumber: report.sequenceNumber,
      status: RouteVoiceReportStatus.AVAILABLE,
      mimeType: report.mimeType,
      durationSeconds: report.durationSeconds,
      selectedLocale: report.selectedLocale,
      clientRecordedAt: report.clientRecordedAt,
      uploadedAt: report.uploadedAt,
      recordedByDisplayName,
      canPlayAudio: true,
    }
  }
}

export function parseSingleByteRange(
  header: string | undefined,
  totalSize: number,
): ParsedByteRange {
  if (header === undefined || header === null || header.trim() === '') {
    return { kind: 'full' }
  }

  const trimmed = header.trim()
  // Reject multi-range (comma) and non-bytes units.
  if (trimmed.includes(',')) {
    return { kind: 'invalid' }
  }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed)
  if (!match) {
    return { kind: 'invalid' }
  }

  const startRaw = match[1]
  const endRaw = match[2]

  if (startRaw === '' && endRaw === '') {
    return { kind: 'invalid' }
  }

  let start: number
  let end: number

  if (startRaw === '') {
    // Suffix bytes: bytes=-N
    const suffix = Number(endRaw)
    if (!Number.isInteger(suffix) || suffix <= 0) {
      return { kind: 'invalid' }
    }
    start = Math.max(0, totalSize - suffix)
    end = totalSize - 1
  } else {
    start = Number(startRaw)
    end = endRaw === '' ? totalSize - 1 : Number(endRaw)
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      start >= totalSize
    ) {
      return { kind: 'invalid' }
    }
    end = Math.min(end, totalSize - 1)
  }

  return { kind: 'single', start, end }
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = 'code' in error ? error.code : undefined
  return code === 11000 || code === '11000'
}
