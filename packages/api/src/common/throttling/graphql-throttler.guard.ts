import { ExecutionContext, Injectable } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler'
import { GraphQLError } from 'graphql'

import { GraphqlRequestContext } from '../../authentication/firebase.types'
import {
  getRequestFromExecutionContext,
  resolveThrottleTracker,
} from './throttle-tracker'
import {
  RATE_LIMITED_ERROR_CODE,
  RATE_LIMITED_MESSAGE,
  THROTTLER_DEFAULT,
} from './throttling.constants'

/**
 * Global GraphQL/HTTP throttler.
 *
 * Uses identity already on the request when present (WS auth, prior guards);
 * otherwise falls back to IP. Never verifies Firebase tokens itself.
 */
@Injectable()
export class GraphqlThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() === 'http') {
      const req = context.switchToHttp().getRequest<{
        method?: string
        path?: string
        url?: string
      }>()
      const path = req.path ?? req.url?.split('?')[0] ?? ''
      if (req.method === 'GET' && (path === '/health' || path === '/health/')) {
        return Promise.resolve(true)
      }
    }

    // Subscriptions use the WS transport; HTTP throttling does not apply to
    // the long-lived connection frames the same way as POST /graphql.
    if (context.getType<string>() === 'graphql') {
      const info = GqlExecutionContext.create(context).getInfo<{
        operation?: { operation?: string }
      }>()
      if (info?.operation?.operation === 'subscription') {
        return Promise.resolve(true)
      }
    }

    return Promise.resolve(false)
  }

  protected getTracker(
    req: Record<string, unknown>,
    context?: ExecutionContext,
  ): Promise<string> {
    const resolvedReq =
      context !== undefined ? getRequestFromExecutionContext(context) : req
    return Promise.resolve(resolveThrottleTracker(resolvedReq).tracker)
  }

  protected getRequestResponse(context: ExecutionContext): {
    req: Record<string, unknown>
    res: Record<string, unknown>
  } {
    if (context.getType<string>() === 'graphql') {
      const gqlCtx =
        GqlExecutionContext.create(context).getContext<GraphqlRequestContext>()
      const fallbackRes: Record<string, unknown> = {
        header: () => undefined,
      }
      const res =
        gqlCtx.res && typeof gqlCtx.res === 'object'
          ? (gqlCtx.res as Record<string, unknown>)
          : fallbackRes
      const req: Record<string, unknown> = {
        ...(gqlCtx.req as unknown as Record<string, unknown>),
      }
      return { req, res }
    }

    return super.getRequestResponse(context)
  }

  protected throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(throttlerLimitDetail.timeToBlockExpire || 1),
    )

    return Promise.reject(
      new GraphQLError(RATE_LIMITED_MESSAGE, {
        extensions: {
          code: RATE_LIMITED_ERROR_CODE,
          retryAfterSeconds,
          // Do not expose tracker, key, IP, UID, or policy internals.
          http: { status: 429 },
        },
      }),
    )
  }

  /**
   * Global APP_GUARD only enforces the `default` named throttler.
   * Strict limits run in StrictIdentityThrottlerGuard after AuthorizationGuard.
   */
  protected handleRequest(
    requestProps: Parameters<ThrottlerGuard['handleRequest']>[0],
  ): Promise<boolean> {
    if (requestProps.throttler.name !== THROTTLER_DEFAULT) {
      return Promise.resolve(true)
    }

    return super.handleRequest(requestProps)
  }
}
