import { getApplicationUser } from '../authentication/graphql-auth.context'
import { GraphqlRequestContext } from '../authentication/firebase.types'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { isPhase27ANotificationType } from './notification-taxonomy'
import { NotificationType } from './notification-type.enum'
import { Notification } from './notification.entity'

export function resolveApplicationUser(
  context: GraphqlRequestContext,
): User | null {
  return getApplicationUser(context)
}

export function canReceiveNotification(
  user: User,
  notification: Notification,
): boolean {
  if (notification.recipientUserId.toString() !== user._id.toString()) {
    return false
  }

  if (isPhase27ANotificationType(notification.type)) {
    if (notification.recipientRole) {
      return notification.recipientRole === user.role
    }

    return true
  }

  if (user.role === UserRole.APOTHEKER) {
    return notification.type !== NotificationType.LOW_STOCK_WARNING
  }

  if (user.role === UserRole.ADMIN) {
    return notification.type === NotificationType.LOW_STOCK_WARNING
  }

  if (user.role === UserRole.BEZORGER) {
    return false
  }

  return false
}

export function filterNotificationReceivedEvent(
  payload: { notificationReceived: Notification },
  _variables: unknown,
  context: GraphqlRequestContext,
): boolean {
  const user = resolveApplicationUser(context)

  if (!user) {
    return false
  }

  return canReceiveNotification(user, payload.notificationReceived)
}
