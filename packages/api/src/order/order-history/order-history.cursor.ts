import { ObjectId } from 'mongodb'

import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'

export type OrderHistoryCursorPayload = {
  submittedAt: string
  id: string
}

export function encodeOrderHistoryCursor(
  submittedAt: Date,
  id: string,
): string {
  const payload: OrderHistoryCursorPayload = {
    submittedAt: submittedAt.toISOString(),
    id: String(id),
  }

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeOrderHistoryCursor(cursor: string): {
  submittedAt: Date
  objectId: ObjectId
} | null {
  if (!cursor || typeof cursor !== 'string') {
    return null
  }

  let parsed: unknown

  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8')
    parsed = JSON.parse(json) as unknown
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  const candidate = parsed as Partial<OrderHistoryCursorPayload>
  if (
    typeof candidate.submittedAt !== 'string' ||
    typeof candidate.id !== 'string'
  ) {
    return null
  }

  const submittedAt = new Date(candidate.submittedAt)
  if (Number.isNaN(submittedAt.getTime())) {
    return null
  }

  const objectIdParsed = tryParseGraphqlObjectId(candidate.id)
  if (!objectIdParsed) {
    return null
  }

  return {
    submittedAt,
    objectId: objectIdParsed.objectId,
  }
}
