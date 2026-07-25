import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { DeliveryProofMethod } from './delivery-proof-method.enum'
import {
  DeliveryQrConfirmAuditEvent,
  DeliveryQrConfirmAuditEventType,
} from './delivery-qr-confirm-audit.entity'

export type RecordDeliveryQrConfirmAuditInput = {
  confirmationEventId: string
  routeId: string
  stopId: string
  courierUserId: string
  recipientProfileId: string
  recipientCity: string
  orderIds: string[]
  deliveredAt: Date
}

@Injectable()
export class DeliveryQrConfirmAuditService {
  constructor(
    @InjectRepository(DeliveryQrConfirmAuditEvent)
    private readonly auditRepository: MongoRepository<DeliveryQrConfirmAuditEvent>,
  ) {}

  /**
   * Persist exactly one focused confirmation audit row.
   * Duplicate `confirmationEventId` is treated as already recorded (unique index).
   */
  async record(input: RecordDeliveryQrConfirmAuditInput): Promise<void> {
    const event = this.auditRepository.create({
      confirmationEventId: input.confirmationEventId,
      type: DeliveryQrConfirmAuditEventType.DELIVERY_STOP_CONFIRMED_BY_QR,
      routeId: input.routeId,
      stopId: input.stopId,
      courierUserId: input.courierUserId,
      recipientProfileId: input.recipientProfileId,
      recipientCity: input.recipientCity,
      orderCount: input.orderIds.length,
      orderIds: [...input.orderIds],
      deliveredAt: input.deliveredAt,
      proofMethod: DeliveryProofMethod.QR,
    })

    try {
      await this.auditRepository.save(event)
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return
      }
      throw error
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  )
}
