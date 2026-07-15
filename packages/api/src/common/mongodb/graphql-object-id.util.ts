import { ObjectId } from 'mongodb'

export type ParsedGraphqlObjectId = {
  objectId: ObjectId
  stringValue: string
}

export function tryParseGraphqlObjectId(
  id: string,
): ParsedGraphqlObjectId | null {
  if (!ObjectId.isValid(id)) {
    return null
  }

  const objectId = new ObjectId(id)

  return {
    objectId,
    stringValue: objectId.toString(),
  }
}

export function parseGraphqlObjectId(id: string): ObjectId {
  const parsed = tryParseGraphqlObjectId(id)

  if (!parsed) {
    throw new Error('Invalid GraphQL ObjectId')
  }

  return parsed.objectId
}
