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
  THROTTLER_STRICT,
} from './throttling.constants'

/**
 * Method-level strict throttler intended to run AFTER AuthorizationGuard so
 * applicationUser / Firebase UID (already verified) can key the bucket.
 *
 * Apply with:
 * `@UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)`
 * `@Throttle({ strict: { limit: …, ttl: … } })` — ttl in milliseconds.
 */
@Injectable()
export class StrictIdentityThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
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
          http: { status: 429 },
        },
      }),
    )
  }

  protected handleRequest(
    requestProps: Parameters<ThrottlerGuard['handleRequest']>[0],
  ): Promise<boolean> {
    // Only enforce the strict named policy; ignore default here (global guard).
    if (requestProps.throttler.name !== THROTTLER_STRICT) {
      return Promise.resolve(true)
    }

    return super.handleRequest(requestProps)
  }
}
