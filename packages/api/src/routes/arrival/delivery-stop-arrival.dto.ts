import { Allow } from 'class-validator'

/**
 * Courier stop-arrival request body.
 * Field validation is enforced in the service so stable `DELIVERY_ARRIVAL_*`
 * codes are returned instead of generic ValidationPipe messages.
 * Never accept client-supplied user/profile identity.
 */
export class DeliveryStopArrivalBodyDto {
  @Allow()
  clientArrivedAt!: unknown

  @Allow()
  idempotencyKey!: unknown
}

/**
 * Safe arrival result — no QR token, nonce, route private fields, or secrets.
 */
export type DeliveryStopArrivalResponseDto = {
  routeId: string
  stopId: string
  clientArrivedAt: string
  recordedAt: string
  arrivedByUserId: string
  arrivalStatus: 'RECORDED'
}
