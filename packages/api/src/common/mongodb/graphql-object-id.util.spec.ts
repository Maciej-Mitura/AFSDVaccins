import { ObjectId } from 'mongodb'

import {
  parseGraphqlObjectId,
  tryParseGraphqlObjectId,
} from './graphql-object-id.util'

describe('graphql-object-id.util', () => {
  const vaccineId = '507f1f77bcf86cd799439011'

  it('parses a valid GraphQL ObjectId string', () => {
    const parsed = tryParseGraphqlObjectId(vaccineId)

    expect(parsed).not.toBeNull()
    expect(parsed?.objectId).toBeInstanceOf(ObjectId)
    expect(parsed?.stringValue).toBe(vaccineId)
  })

  it('rejects malformed IDs', () => {
    expect(tryParseGraphqlObjectId('invalid-id')).toBeNull()
  })

  it('parseGraphqlObjectId returns an ObjectId for valid input', () => {
    expect(parseGraphqlObjectId(vaccineId).toString()).toBe(vaccineId)
  })
})
