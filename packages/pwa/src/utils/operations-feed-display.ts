/**
 * Localised presentation for admin operations-feed detail lines.
 * Never surfaces raw backend `event.message` as primary UI copy.
 */

import { orderStatusLabel, translate } from '@/i18n'

export type OperationsFeedDisplayEvent = {
  eventType?: string | null
  message?: string | null
  order?: {
    id?: string | null
    status?: string | null
    totalQuantity?: number | null
  } | null
  vaccine?: {
    name?: string | null
    stockQuantity?: number | null
    stockWarningThreshold?: number | null
  } | null
}

export type TranslateFn = (
  key: string,
  values?: Record<string, unknown>,
) => string

function shortOrderId(
  id: string | null | undefined,
  t: TranslateFn,
): string {
  const value = String(id ?? '').trim()
  if (!value) {
    return t('common.emDash')
  }
  if (value.length <= 8) {
    return value
  }
  return value.slice(-8)
}

/**
 * Build the secondary feed line from structured event fields.
 * Unknown / incomplete events use a generic translated fallback.
 */
export function resolveOperationsFeedDetail(
  event: OperationsFeedDisplayEvent,
  t: TranslateFn = translate,
): string {
  const eventType = String(event.eventType ?? '')

  if (eventType === 'NEW_ORDER' && event.order) {
    return t('admin.operationsFeed.newOrder', {
      orderId: shortOrderId(event.order.id, t),
      quantity: event.order.totalQuantity ?? 0,
    })
  }

  if (eventType === 'ORDER_STATUS_CHANGED' && event.order) {
    return t('admin.operationsFeed.orderStatusChanged', {
      orderId: shortOrderId(event.order.id, t),
      status: orderStatusLabel(String(event.order.status ?? '')),
    })
  }

  if (eventType === 'LOW_STOCK' && event.vaccine) {
    return t('admin.operationsFeed.lowStock', {
      vaccineName:
        String(event.vaccine.name ?? '').trim() || t('common.emDash'),
      quantityRemaining: event.vaccine.stockQuantity ?? 0,
      stockThreshold: event.vaccine.stockWarningThreshold ?? 0,
    })
  }

  return t('admin.operationsFeed.unknown')
}
