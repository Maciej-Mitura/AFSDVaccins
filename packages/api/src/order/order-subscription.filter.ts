import { GraphqlRequestContext } from '../authentication/firebase.types'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { Order } from './order.entity'

export function resolveApplicationUser(
  context: GraphqlRequestContext,
): User | null {
  return context.req.applicationUser ?? null
}

export function canReceiveOrderEvent(user: User, order: Order): boolean {
  if (user.role === UserRole.ADMIN) {
    return true
  }

  if (user.role === UserRole.APOTHEKER) {
    return order.apothekerId.toString() === user._id.toString()
  }

  return false
}

export function filterOrderCreatedEvent(
  payload: { orderCreated: Order },
  _variables: unknown,
  context: GraphqlRequestContext,
): boolean {
  const user = resolveApplicationUser(context)

  if (!user) {
    return false
  }

  return canReceiveOrderEvent(user, payload.orderCreated)
}

export function filterOrderUpdatedEvent(
  payload: { orderUpdated: Order },
  _variables: unknown,
  context: GraphqlRequestContext,
): boolean {
  const user = resolveApplicationUser(context)

  if (!user) {
    return false
  }

  return canReceiveOrderEvent(user, payload.orderUpdated)
}
