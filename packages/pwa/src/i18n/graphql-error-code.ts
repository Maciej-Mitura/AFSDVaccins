import { ApolloError } from '@apollo/client/core'

/**
 * Extract a stable GraphQL extensions.code when present.
 * Shared by domain composables and the user-facing error mapper.
 */
export function extractGraphQLErrorCode(error: unknown): string | null {
  if (!(error instanceof ApolloError)) {
    return null
  }

  for (const graphQLError of error.graphQLErrors) {
    const code = graphQLError.extensions?.code
    if (typeof code === 'string' && code.length > 0) {
      return code
    }
  }

  return null
}
