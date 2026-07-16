import { getApplicationUser } from '../authentication/graphql-auth.context'
import { GraphqlRequestContext } from '../authentication/firebase.types'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { DeliveryRoute } from './delivery-route.entity'

export function resolveApplicationUser(
  context: GraphqlRequestContext,
): User | null {
  return getApplicationUser(context)
}

export function canReceiveBezorgerRouteUpdate(
  user: User,
  route: DeliveryRoute,
  bezorgerProfileId: string | null,
): boolean {
  if (user.role !== UserRole.BEZORGER) {
    return false
  }

  if (!bezorgerProfileId) {
    return false
  }

  return route.bezorgerProfileId.toString() === bezorgerProfileId.toString()
}
