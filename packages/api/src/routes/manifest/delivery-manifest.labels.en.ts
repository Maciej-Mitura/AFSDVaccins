/**
 * Centralised English labels for Phase 29A PDF output.
 * Localisation can wrap this map later; do not scatter strings in drawing code.
 */
export const DELIVERY_MANIFEST_LABELS_EN = {
  title: 'Delivery Manifest',
  subject: 'Generated delivery route manifest',
  routeDate: 'Route date',
  routeStatus: 'Route status',
  generatedAt: 'Manifest generated',
  assignedCourier: 'Assigned courier',
  stopCount: 'Stops',
  orderCount: 'Orders',
  lineCount: 'Vaccine lines',
  itemQuantity: 'Total item quantity',
  routeCancelledNotice: 'This route is cancelled. Active QR codes are not shown.',
  stopHeading: 'Stop {sequence}',
  pharmacy: 'Pharmacy',
  address: 'Address',
  city: 'City',
  stopStatus: 'Stop status',
  stopStatusPending: 'Pending',
  stopStatusArrived: 'Arrived',
  stopStatusDelivered: 'Delivered',
  stopOrders: 'Orders at this stop',
  stopTotals: 'Stop totals',
  orderReference: 'Order reference',
  vaccine: 'Vaccine',
  quantity: 'Quantity',
  orderStatus: 'Order status',
  arrivalHeading: 'Arrival',
  arrivalClientTime: 'Client arrival time',
  arrivalServerTime: 'Server recorded time',
  arrivalCourier: 'Courier',
  arrivalPendingDelivery: 'Arrived - delivery not yet confirmed',
  deliveryProofHeading: 'Delivery confirmation',
  deliveryStatus: 'Delivery status',
  deliveryConfirmed: 'Delivery confirmed',
  deliveredAt: 'Delivered at',
  deliveredBy: 'Delivered by',
  proofMethod: 'Proof method',
  proofMethodQr: 'QR',
  associatedOrders: 'Associated orders',
  recipientCity: 'Recipient city',
  confirmationReference: 'Confirmation reference',
  pendingValue: '-',
  qrHeading: 'Delivery QR',
  qrActive: 'Active delivery QR',
  qrConsumed: 'Delivery confirmed - active QR omitted',
  qrUnavailable: 'QR unavailable',
  qrOmittedCancelled: 'QR omitted - route cancelled',
  qrOmittedInactive: 'QR omitted - route inactive',
  summaryHeading: 'Route summary',
  stopSummaryHeading: 'Stop summary',
  page: 'Page {page}',
  notAssigned: 'Not assigned',
} as const

export type DeliveryManifestLabelKey = keyof typeof DELIVERY_MANIFEST_LABELS_EN

export type DeliveryManifestLabels = Record<DeliveryManifestLabelKey, string>

export function getDeliveryManifestLabels(): DeliveryManifestLabels {
  return { ...DELIVERY_MANIFEST_LABELS_EN }
}
