import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'

import { GraphqlRequestContext } from '../../authentication/firebase.types'
import { User } from '../user.entity'

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User => {
    const gqlContext = GqlExecutionContext.create(context)
    const request = gqlContext.getContext<GraphqlRequestContext>().req

    if (!request.applicationUser) {
      throw new Error(
        'Application user is not available on the request context',
      )
    }

    return request.applicationUser
  },
)
