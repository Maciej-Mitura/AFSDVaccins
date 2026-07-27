import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import {
  RouteVoiceReportAuditEvent,
  RouteVoiceReportAuditEventType,
} from './route-voice-report-audit.entity'

export type RecordRouteVoiceReportCreatedInput = {
  routeId: string
  reportId: string
  sequenceNumber: number
  bezorgerProfileId: string
  actorUserId: string
  durationSeconds: number
  sizeBytes: number
  mimeType: string
  selectedLocale: string | null
  createdAt: Date
}

@Injectable()
export class RouteVoiceReportAuditService {
  private readonly logger = new Logger(RouteVoiceReportAuditService.name)

  constructor(
    @InjectRepository(RouteVoiceReportAuditEvent)
    private readonly auditRepository: MongoRepository<RouteVoiceReportAuditEvent>,
  ) {}

  /**
   * Insert creation audit once per reportId.
   * Idempotent replays must not create duplicate audit rows.
   */
  async recordCreated(
    input: RecordRouteVoiceReportCreatedInput,
  ): Promise<{ inserted: boolean }> {
    return this.insertOnce({
      type: RouteVoiceReportAuditEventType.ROUTE_VOICE_REPORT_CREATED,
      idempotencyKey: 'created',
      routeId: input.routeId,
      reportId: input.reportId,
      sequenceNumber: input.sequenceNumber,
      bezorgerProfileId: input.bezorgerProfileId,
      actorUserId: input.actorUserId,
      durationSeconds: input.durationSeconds,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      selectedLocale: input.selectedLocale,
      provider: null,
      requestedLocale: null,
      detectedLocale: null,
      failureCode: null,
      attemptCount: null,
      previousFailureCode: null,
      createdAt: input.createdAt,
    })
  }

  async recordTranscriptionCompleted(input: {
    routeId: string
    reportId: string
    sequenceNumber: number
    provider: string
    requestedLocale: string
    detectedLocale: string | null
    durationSeconds: number
    completedAt: Date
    attemptCount: number
  }): Promise<{ inserted: boolean }> {
    return this.insertOnce({
      type: RouteVoiceReportAuditEventType.ROUTE_VOICE_REPORT_TRANSCRIPTION_COMPLETED,
      idempotencyKey: 'completed',
      routeId: input.routeId,
      reportId: input.reportId,
      sequenceNumber: input.sequenceNumber,
      bezorgerProfileId: null,
      actorUserId: null,
      durationSeconds: input.durationSeconds,
      sizeBytes: null,
      mimeType: null,
      selectedLocale: null,
      provider: input.provider,
      requestedLocale: input.requestedLocale,
      detectedLocale: input.detectedLocale,
      failureCode: null,
      attemptCount: input.attemptCount,
      previousFailureCode: null,
      createdAt: input.completedAt,
    })
  }

  async recordTranscriptionFailed(input: {
    routeId: string
    reportId: string
    sequenceNumber: number
    provider: string
    failureCode: string
    attemptCount: number
    failedAt: Date
  }): Promise<{ inserted: boolean }> {
    return this.insertOnce({
      type: RouteVoiceReportAuditEventType.ROUTE_VOICE_REPORT_TRANSCRIPTION_FAILED,
      idempotencyKey: `failed:${input.attemptCount}`,
      routeId: input.routeId,
      reportId: input.reportId,
      sequenceNumber: input.sequenceNumber,
      bezorgerProfileId: null,
      actorUserId: null,
      durationSeconds: null,
      sizeBytes: null,
      mimeType: null,
      selectedLocale: null,
      provider: input.provider,
      requestedLocale: null,
      detectedLocale: null,
      failureCode: input.failureCode,
      attemptCount: input.attemptCount,
      previousFailureCode: null,
      createdAt: input.failedAt,
    })
  }

  async recordTranscriptionRetried(input: {
    routeId: string
    reportId: string
    adminActorUserId: string
    previousFailureCode: string | null
    requestedAt: Date
    retryGeneration: number
  }): Promise<{ inserted: boolean }> {
    return this.insertOnce({
      type: RouteVoiceReportAuditEventType.ROUTE_VOICE_REPORT_TRANSCRIPTION_RETRIED,
      idempotencyKey: `retried:${input.retryGeneration}`,
      routeId: input.routeId,
      reportId: input.reportId,
      sequenceNumber: null,
      bezorgerProfileId: null,
      actorUserId: input.adminActorUserId,
      durationSeconds: null,
      sizeBytes: null,
      mimeType: null,
      selectedLocale: null,
      provider: null,
      requestedLocale: null,
      detectedLocale: null,
      failureCode: null,
      attemptCount: null,
      previousFailureCode: input.previousFailureCode,
      createdAt: input.requestedAt,
    })
  }

  async countByReportId(reportId: string): Promise<number> {
    return this.auditRepository.countBy({ reportId })
  }

  private async insertOnce(
    doc: Omit<RouteVoiceReportAuditEvent, '_id' | 'recordedAt'>,
  ): Promise<{ inserted: boolean }> {
    const existing = await this.auditRepository.findOne({
      where: {
        reportId: doc.reportId,
        type: doc.type,
        idempotencyKey: doc.idempotencyKey,
      },
    })
    if (existing) {
      return { inserted: false }
    }

    try {
      await this.auditRepository.save(doc)
      return { inserted: true }
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return { inserted: false }
      }
      this.logger.warn('voice_report_audit_insert_failed')
      throw error
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = 'code' in error ? error.code : undefined
  return code === 11000 || code === '11000'
}
