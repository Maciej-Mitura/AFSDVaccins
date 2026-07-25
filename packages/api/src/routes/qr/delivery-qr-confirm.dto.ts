import { Allow } from 'class-validator'

import { DeliveryProofMethod } from './delivery-proof-method.enum'
import { RouteStatus } from '../route-status.enum'

/**
 * Courier confirm-delivery request body.
 * Token validation (required / trim / max length) is enforced in the service so
 * stable `DELIVERY_QR_*` codes are returned instead of generic ValidationPipe
 * messages. Never log or put the token in URLs/query strings.
 */
export class DeliveryQrConfirmBodyDto {
  @Allow()
  token!: unknown
}

/**
 * Safe confirmation result — no token, nonce, nonceHash, or signing material.
 */
export type DeliveryQrConfirmResponseDto = {
  routeId: string
  stopId: string
  deliveredAt: string
  deliveredByUserId: string
  orderIds: string[]
  orderCount: number
  recipientCity: string
  proofMethod: DeliveryProofMethod
  routeStatus: RouteStatus
  remainingStopCount: number
}
