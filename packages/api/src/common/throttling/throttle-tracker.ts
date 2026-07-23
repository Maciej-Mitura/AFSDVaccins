import { ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'

import { GraphqlRequestContext } from '../../authentication/firebase.types'
import { User } from '../../user/user.entity'

export type ThrottleTrackerSource =
  | 'application-user'
  | 'firebase-uid'
  | 'ip'
  | 'anonymous'

export type ThrottleTrackerResult = {
  /** Opaque tracker string used by @nestjs/throttler (never log this in production). */
  tracker: string
  source: ThrottleTrackerSource
}

/**
 * Builds a throttle tracker from identity already present on the request/context.
 * Does NOT verify Firebase tokens or load Mongo users.
 *
 * Priority:
 * 1. applicationUser id (stable application identity)
 * 2. verified Firebase UID already attached to the request
 * 3. request IP
 * 4. anonymous fallback
 */
export function resolveThrottleTracker(
  req: Record<string, unknown> | undefined,
): ThrottleTrackerResult {
  const applicationUser = req?.applicationUser as User | undefined
  if (applicationUser?._id) {
    return {
      tracker: `app:${String(applicationUser._id)}`,
      source: 'application-user',
    }
  }

  const firebaseUser = req?.user as { uid?: string } | undefined
  if (firebaseUser?.uid) {
    return {
      tracker: `fb:${firebaseUser.uid}`,
      source: 'firebase-uid',
    }
  }

  const ip = typeof req?.ip === 'string' ? req.ip : undefined
  if (ip && ip.length > 0) {
    return {
      tracker: `ip:${ip}`,
      source: 'ip',
    }
  }

  const socket = req?.socket as { remoteAddress?: string } | undefined
  if (socket?.remoteAddress) {
    return {
      tracker: `ip:${socket.remoteAddress}`,
      source: 'ip',
    }
  }

  return {
    tracker: 'anonymous',
    source: 'anonymous',
  }
}

/**
 * Prefer GraphQL HTTP/WS req; fall back to HTTP switch for REST (/health).
 */
export function getRequestFromExecutionContext(
  context: ExecutionContext,
): Record<string, unknown> {
  if (context.getType<string>() === 'graphql') {
    const gqlContext =
      GqlExecutionContext.create(context).getContext<GraphqlRequestContext>()
    return {
      ...(gqlContext.req as unknown as Record<string, unknown>),
    }
  }

  return context.switchToHttp().getRequest<Record<string, unknown>>()
}
