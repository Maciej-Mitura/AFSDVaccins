import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { truncateText } from './vaccine-image-analysis.bounds'
import {
  VaccineImageAuditEvent,
  VaccineImageAuditEventType,
} from './vaccine-image-audit.entity'

const MAX_REASON_SUMMARY = 200

export type RecordVaccineImageAuditInput = {
  vaccineId: string
  actorId: string
  type: VaccineImageAuditEventType
  validationStatus?: string | null
  provider?: string | null
  replaced?: boolean
  reasonSummary?: string | null
}

@Injectable()
export class VaccineImageAuditService {
  constructor(
    @InjectRepository(VaccineImageAuditEvent)
    private readonly auditRepository: MongoRepository<VaccineImageAuditEvent>,
  ) {}

  async record(input: RecordVaccineImageAuditInput): Promise<void> {
    const event = this.auditRepository.create({
      vaccineId: input.vaccineId,
      actorId: input.actorId,
      type: input.type,
      validationStatus: input.validationStatus ?? null,
      provider: input.provider ?? null,
      replaced: input.replaced === true,
      reasonSummary:
        typeof input.reasonSummary === 'string'
          ? truncateText(input.reasonSummary.trim(), MAX_REASON_SUMMARY)
          : null,
    })
    await this.auditRepository.save(event)
  }
}
