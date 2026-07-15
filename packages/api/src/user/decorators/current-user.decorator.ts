import { createParamDecorator, ExecutionContext } from '@nestjs/common'

import {
  getGraphqlRequestContext,
  resolveNormalizedGraphqlRequest,
  syncAuthToRequest,
} from '../../authentication/graphql-auth.context'
import { User } from '../user.entity'

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User => {
    const gqlContext = getGraphqlRequestContext(context)
    const normalized = resolveNormalizedGraphqlRequest(gqlContext)
    syncAuthToRequest(gqlContext, normalized)

    if (!gqlContext.req.applicationUser) {
      throw new Error(
        'Application user is not available on the request context',
      )
    }

    return gqlContext.req.applicationUser
  },
)
