import { Allow } from 'class-validator'

import { OrderStatus } from '../../order/order-status.enum'
import { RouteStatus } from '../route-status.enum'

/**
 * Courier scan-preview request body.
 * Token validation (required / trim / max length) is enforced in the service so
 * stable `DELIVERY_QR_*` codes are returned instead of generic ValidationPipe
 * messages. Never log or put the token in URLs/query strings.
 */
export class DeliveryQrPreviewBodyDto {
  @Allow()
  token!: unknown
}

export type DeliveryQrPreviewPharmacyDto = {
  name: string
  addressLine: string
  postalCode: string
  city: string
}

export type DeliveryQrPreviewOrderLineDto = {
  vaccineId: string
  vaccineName: string
  quantity: number
}

export type DeliveryQrPreviewOrderDto = {
  orderId: string
  status: OrderStatus
  lines: DeliveryQrPreviewOrderLineDto[]
}

/**
 * Safe courier preview — no token, nonce, nonceHash, or signing material.
 */
export type DeliveryQrPreviewResponseDto = {
  routeId: string
  stopId: string
  routeDate: string
  routeStatus: RouteStatus
  stopSequence: number
  stopName: string
  pharmacy: DeliveryQrPreviewPharmacyDto
  orderCount: number
  orders: DeliveryQrPreviewOrderDto[]
  totalLineCount: number
  totalItemQuantity: number
  qrIssuedAt: string
  canConfirmDelivery: boolean
}
