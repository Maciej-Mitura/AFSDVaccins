import { ApolloError } from '@apollo/client/core'

type OriginalErrorBody = {
  error?: string
  incompleteStopCount?: number
  message?: string
}

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
    if (
      typeof code === 'string' &&
      code.length > 0 &&
      code !== 'INTERNAL_SERVER_ERROR' &&
      code !== 'GRAPHQL_VALIDATION_FAILED'
    ) {
      return code
    }

    const originalError = graphQLError.extensions?.originalError as
      | OriginalErrorBody
      | undefined
    if (typeof originalError?.error === 'string' && originalError.error.length > 0) {
      return originalError.error
    }
  }

  return null
}

/**
 * Read safe fields from Nest BadRequestException bodies nested under extensions.
 */
export function extractGraphQLOriginalError(
  error: unknown,
): OriginalErrorBody | null {
  if (!(error instanceof ApolloError)) {
    return null
  }

  for (const graphQLError of error.graphQLErrors) {
    const originalError = graphQLError.extensions?.originalError as
      | OriginalErrorBody
      | undefined
    if (originalError && typeof originalError === 'object') {
      return originalError
    }
  }

  return null
}
