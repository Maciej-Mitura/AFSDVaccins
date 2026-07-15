import { GraphqlRequestContext } from '../authentication/firebase.types'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { Notification } from './notification.entity'

export function resolveApplicationUser(
  context: GraphqlRequestContext,
): User | null {
  return context.req.applicationUser ?? null
}

export function canReceiveNotification(
  user: User,
  notification: Notification,
): boolean {
  if (user.role !== UserRole.APOTHEKER) {
    return false
  }

  return (
    notification.recipientUserId.toString() === user._id.toString()
  )
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
