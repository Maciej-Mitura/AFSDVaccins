import { translate } from './translate'

/**
 * Central presentation labels for domain enums / API status codes.
 * Backend enum values remain unchanged — only display text is translated.
 * Comparisons use serialized string values to avoid unsafe enum/string mixing.
 */

export function orderStatusLabel(status: string): string {
  const value = String(status)
  if (value === 'PENDING') {
    return translate('status.order.pending')
  }
  if (value === 'PLANNED') {
    return translate('status.order.planned')
  }
  if (value === 'DELIVERED') {
    return translate('status.order.delivered')
  }
  if (value === 'CANCELLED') {
    return translate('status.order.cancelled')
  }
  return translate('common.unknown')
}

export function routeStatusLabel(status: string): string {
  const value = String(status)
  if (value === 'ASSIGNED') {
    return translate('status.route.assigned')
  }
  if (value === 'IN_PROGRESS') {
    return translate('status.route.inProgress')
  }
  if (value === 'COMPLETED') {
    return translate('status.route.completed')
  }
  if (value === 'CANCELLED') {
    return translate('status.route.cancelled')
  }
  return translate('common.unknown')
}

export function userRoleLabel(role: string): string {
  const value = String(role)
  if (value === 'ADMIN') {
    return translate('status.role.admin')
  }
  if (value === 'APOTHEKER') {
    return translate('status.role.apotheker')
  }
  if (value === 'BEZORGER') {
    return translate('status.role.bezorger')
  }
  return translate('common.unknown')
}

export function apiHealthStatusLabel(status: string): string {
  const value = String(status).trim().toLowerCase()
  if (value === 'ok') {
    return translate('status.api.ok')
  }
  return translate('common.unknown')
}

export function operationsFeedEventTypeLabel(eventType: string): string {
  const value = String(eventType)
  if (value === 'NEW_ORDER') {
    return translate('status.operations.newOrder')
  }
  if (value === 'ORDER_STATUS_CHANGED') {
    return translate('status.operations.orderStatusChanged')
  }
  if (value === 'LOW_STOCK') {
    return translate('status.operations.lowStock')
  }
  return translate('common.unknown')
}

export function activeInactiveLabel(isActive: boolean): string {
  return translate(isActive ? 'status.active' : 'status.inactive')
}

export function notificationReadLabel(isRead: boolean): string {
  return translate(
    isRead ? 'status.notification.read' : 'status.notification.unread',
  )
}

export function deliveryMethodLabel(method: string | null | undefined): string {
  if (method == null || method === '') {
    return translate('orderHistory.value.unavailable')
  }
  const value = String(method)
  if (value === 'ADMIN') {
    return translate('orderHistory.deliveryMethod.admin')
  }
  if (value === 'QR') {
    return translate('orderHistory.deliveryMethod.qr')
  }
  return translate('common.unknown')
}
