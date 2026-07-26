import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { UserRole } from '../../user/user-role.enum'
import {
  DeliveryManifestAuditEvent,
  DeliveryManifestAuditEventType,
} from './delivery-manifest-audit.entity'
import type { ManifestScope } from './delivery-manifest.types'

export type RecordDeliveryManifestAuditInput = {
  routeId: string
  stopId?: string | null
  scope: ManifestScope
  actorUserId: string
  actorRole: UserRole
  generatedAt: Date
}

/**
 * Focused audit writer for successful manifest generation.
 * Failures are logged and rethrown so the controller can decide policy.
 */
@Injectable()
export class DeliveryManifestAuditService {
  private readonly logger = new Logger(DeliveryManifestAuditService.name)

  constructor(
    @InjectRepository(DeliveryManifestAuditEvent)
    private readonly auditRepository: MongoRepository<DeliveryManifestAuditEvent>,
  ) {}

  async record(input: RecordDeliveryManifestAuditInput): Promise<void> {
    const event = this.auditRepository.create({
      type: DeliveryManifestAuditEventType.DELIVERY_MANIFEST_GENERATED,
      routeId: input.routeId,
      stopId: input.stopId ?? null,
      scope: input.scope,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      generatedAt: input.generatedAt,
    })

    try {
      await this.auditRepository.insert(event)
    } catch (error) {
      this.logger.error(
        'Failed to persist delivery manifest audit event.',
        error instanceof Error ? error.message : 'unknown',
      )
      throw error
    }
  }
}
