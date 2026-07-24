import { translate } from './translate'

/**
 * Central presentation labels for domain enums.
 * Backend enum values remain unchanged — only display text is translated.
 * Comparisons use serialized string values to avoid unsafe enum/string mixing.
 */

export function orderStatusLabel(status: string): string {
  const value = String(status)
  if (value === 'PENDING' || value === 'PLANNED') {
    return translate('status.order.pending')
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

export function activeInactiveLabel(isActive: boolean): string {
  return translate(isActive ? 'status.active' : 'status.inactive')
}

export function notificationReadLabel(isRead: boolean): string {
  return translate(
    isRead ? 'status.notification.read' : 'status.notification.unread',
  )
}
