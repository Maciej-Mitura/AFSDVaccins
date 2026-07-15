import {
  extractBearerTokenFromConnectionParams,
} from './graphql-ws-auth.util'

describe('graphql-ws-auth.util', () => {
  it('extracts bearer token from Authorization connection parameter', () => {
    expect(
      extractBearerTokenFromConnectionParams({
        Authorization: 'Bearer firebase-token',
      }),
    ).toBe('firebase-token')
  })

  it('extracts bearer token from lowercase authorization parameter', () => {
    expect(
      extractBearerTokenFromConnectionParams({
        authorization: 'Bearer firebase-token',
      }),
    ).toBe('firebase-token')
  })

  it('returns null when Authorization is missing', () => {
    expect(extractBearerTokenFromConnectionParams({})).toBeNull()
    expect(extractBearerTokenFromConnectionParams(undefined)).toBeNull()
  })

  it('returns null for malformed bearer values', () => {
    expect(
      extractBearerTokenFromConnectionParams({
        Authorization: 'Token firebase-token',
      }),
    ).toBeNull()
  })
})
