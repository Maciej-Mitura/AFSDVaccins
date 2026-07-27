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
    const existing = await this.auditRepository.findOne({
      where: { reportId: input.reportId },
    })
    if (existing) {
      return { inserted: false }
    }

    try {
      await this.auditRepository.save({
        type: RouteVoiceReportAuditEventType.ROUTE_VOICE_REPORT_CREATED,
        routeId: input.routeId,
        reportId: input.reportId,
        sequenceNumber: input.sequenceNumber,
        bezorgerProfileId: input.bezorgerProfileId,
        actorUserId: input.actorUserId,
        durationSeconds: input.durationSeconds,
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
        selectedLocale: input.selectedLocale,
        createdAt: input.createdAt,
      })
      return { inserted: true }
    } catch (error) {
      // Unique index race: treat as already recorded.
      if (isDuplicateKeyError(error)) {
        return { inserted: false }
      }
      this.logger.warn('voice_report_audit_insert_failed')
      throw error
    }
  }

  async countByReportId(reportId: string): Promise<number> {
    return this.auditRepository.countBy({ reportId })
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = 'code' in error ? error.code : undefined
  return code === 11000 || code === '11000'
}
