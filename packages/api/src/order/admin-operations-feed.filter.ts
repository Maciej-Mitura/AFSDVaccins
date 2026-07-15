import { getApplicationUser } from '../authentication/graphql-auth.context'
import { GraphqlRequestContext } from '../authentication/firebase.types'
import { UserRole } from '../user/user-role.enum'
import { AdminOperationsFeedEvent } from './admin-operations-feed.type'

export function filterAdminOperationsFeedEvent(
  _payload: { adminOperationsFeed: AdminOperationsFeedEvent },
  _variables: unknown,
  context: GraphqlRequestContext,
): boolean {
  const user = getApplicationUser(context)

  return user?.role === UserRole.ADMIN
}
