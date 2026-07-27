import { HttpException } from '@nestjs/common'
import type { GraphQLFormattedError } from 'graphql'

/**
 * Prefer stable domain `error` codes from Nest HttpException response bodies
 * ({ message, error }) over Apollo's generic INTERNAL_SERVER_ERROR.
 */
export function formatGraphqlHttpException(
  formattedError: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  const originalError = readOriginalError(error)
  if (!(originalError instanceof HttpException)) {
    return formattedError
  }

  const response = originalError.getResponse()
  const domainCode = readDomainErrorCode(response)
  if (!domainCode) {
    return formattedError
  }

  const message =
    readDomainMessage(response) ?? formattedError.message ?? domainCode

  return {
    ...formattedError,
    message,
    extensions: {
      ...formattedError.extensions,
      code: domainCode,
      originalError: {
        error: domainCode,
        message,
      },
    },
  }
}

function readOriginalError(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'originalError' in error
  ) {
    return (error as { originalError?: unknown }).originalError
  }
  return error
}

function readDomainErrorCode(response: string | object): string | null {
  if (typeof response !== 'object' || response === null) {
    return null
  }
  const code = (response as { error?: unknown }).error
  return typeof code === 'string' && code.length > 0 ? code : null
}

function readDomainMessage(response: string | object): string | null {
  if (typeof response === 'string') {
    return response
  }
  if (typeof response !== 'object' || response === null) {
    return null
  }
  const message = (response as { message?: unknown }).message
  if (typeof message === 'string') {
    return message
  }
  if (Array.isArray(message) && typeof message[0] === 'string') {
    return message[0]
  }
  return null
}
