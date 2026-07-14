import { ExecutionContext, Injectable } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { AuthGuard } from '@nestjs/passport'
import { Request } from 'express'

import { FIREBASE_AUTH_STRATEGY } from './firebase-auth.strategy'
import { GraphqlRequestContext } from './firebase.types'

@Injectable()
export class AuthorizationGuard extends AuthGuard(FIREBASE_AUTH_STRATEGY) {
  getRequest(context: ExecutionContext): Request {
    const contextType = context.getType<string>()

    if (contextType === 'graphql') {
      const gqlContext = GqlExecutionContext.create(context)
      return gqlContext.getContext<GraphqlRequestContext>().req as Request
    }

    return context.switchToHttp().getRequest<Request>()
  }
}
