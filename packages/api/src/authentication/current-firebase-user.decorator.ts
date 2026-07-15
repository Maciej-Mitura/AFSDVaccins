import { createParamDecorator, ExecutionContext } from '@nestjs/common'

import {
  getGraphqlRequestContext,
  resolveNormalizedGraphqlRequest,
  syncAuthToRequest,
} from './graphql-auth.context'
import { VerifiedFirebaseIdentity } from './firebase.types'

export const CurrentFirebaseUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VerifiedFirebaseIdentity => {
    const gqlContext = getGraphqlRequestContext(context)
    const normalized = resolveNormalizedGraphqlRequest(gqlContext)
    syncAuthToRequest(gqlContext, normalized)

    return gqlContext.req.user as VerifiedFirebaseIdentity
  },
)
