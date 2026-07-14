import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'

import {
  GraphqlRequestContext,
  VerifiedFirebaseIdentity,
} from './firebase.types'

export const CurrentFirebaseUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VerifiedFirebaseIdentity => {
    const gqlContext = GqlExecutionContext.create(context)
    const request = gqlContext.getContext<GraphqlRequestContext>().req

    return request.user as VerifiedFirebaseIdentity
  },
)
