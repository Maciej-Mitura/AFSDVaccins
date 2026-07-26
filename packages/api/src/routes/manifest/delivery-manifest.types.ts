import { OrderStatus } from '../../order/order-status.enum'
import { RouteStatus } from '../route-status.enum'
import { UserRole } from '../../user/user-role.enum'

/** Provider-neutral stop delivery state for manifest rendering. */
export type ManifestStopStatus = 'pending' | 'arrived' | 'delivered'

/** QR inclusion state — never includes the raw token. */
export type ManifestQrState =
  | 'ACTIVE'
  | 'CONSUMED'
  | 'UNAVAILABLE'
  | 'OMITTED_CANCELLED'
  | 'OMITTED_ROUTE_INACTIVE'

export type ManifestScope = 'ROUTE' | 'STOP'

export type ManifestOrderLineData = {
  vaccineId: string
  vaccineName: string
  quantity: number
}

export type ManifestOrderData = {
  orderId: string
  orderStatus: OrderStatus
  deliveryDate: string
  lines: ManifestOrderLineData[]
  lineCount: number
  itemQuantity: number
}

export type ManifestPharmacyData = {
  name: string
  addressLine: string
  postalCode: string
  city: string
}

export type ManifestArrivalData = {
  clientArrivedAt: Date
  recordedAt: Date
  courierDisplayName: string | null
}

export type ManifestDeliveryProofData = {
  method: 'QR'
  deliveredAt: Date
  courierDisplayName: string | null
  associatedOrderCount: number
  recipientCity: string
  confirmationReference: string | null
}

/**
 * QR render payload for PDF embedding.
 * Never includes encodedToken, nonceHash, or signing material.
 */
export type ManifestQrData = {
  available: boolean
  state: ManifestQrState
  /** PNG bytes when state === ACTIVE; otherwise null. */
  pngBytes: Buffer | null
}

export type ManifestStopTotals = {
  orderCount: number
  lineCount: number
  itemQuantity: number
}

export type ManifestStopData = {
  stopId: string | null
  sequence: number
  pharmacy: ManifestPharmacyData
  stopStatus: ManifestStopStatus
  orders: ManifestOrderData[]
  totals: ManifestStopTotals
  arrival: ManifestArrivalData | null
  deliveryProof: ManifestDeliveryProofData | null
  qr: ManifestQrData
}

export type ManifestActorData = {
  userId: string
  role: UserRole
}

export type ManifestCourierData = {
  displayName: string
  profileId: string
}

/**
 * Provider-neutral route/stop manifest DTO.
 * Never pass raw Mongo entities into the PDF renderer.
 */
export type RouteManifestData = {
  scope: ManifestScope
  routeId: string
  routeDate: string
  routeStatus: RouteStatus
  routeCancelled: boolean
  generatedAt: Date
  generatedBy: ManifestActorData
  /** Present for full-route manifests when courier profile is known. */
  assignedCourier: ManifestCourierData | null
  stopCount: number
  totalOrderCount: number
  totalLineCount: number
  totalItemQuantity: number
  stops: ManifestStopData[]
}

export type DeliveryManifestPdfResult = {
  pdfBytes: Buffer
  filename: string
  manifest: RouteManifestData
}
