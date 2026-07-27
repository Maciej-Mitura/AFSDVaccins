import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import {
  CourierAnalyticsAuditEvent,
  CourierAnalyticsAuditEventType,
} from './courier-analytics-audit.entity'

export type RecordCourierAnalyticsExportAuditInput = {
  actorUserId: string
  generatedAt: Date
  rowCount: number
}

@Injectable()
export class CourierAnalyticsAuditService {
  private readonly logger = new Logger(CourierAnalyticsAuditService.name)

  constructor(
    @InjectRepository(CourierAnalyticsAuditEvent)
    private readonly auditRepository: MongoRepository<CourierAnalyticsAuditEvent>,
  ) {}

  async recordExport(
    input: RecordCourierAnalyticsExportAuditInput,
  ): Promise<void> {
    const event = this.auditRepository.create({
      type: CourierAnalyticsAuditEventType.COURIER_ANALYTICS_EXPORTED,
      actorUserId: input.actorUserId,
      generatedAt: input.generatedAt,
      rowCount: input.rowCount,
      scope: 'ALL_TIME',
      format: 'CSV',
    })

    try {
      await this.auditRepository.insert(event)
    } catch (error) {
      this.logger.error(
        'Failed to persist courier analytics export audit event.',
        error instanceof Error ? error.message : 'unknown',
      )
      throw error
    }
  }
}
