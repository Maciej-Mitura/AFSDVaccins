import { RestError } from '@azure/storage-blob'

import {
  RouteVoiceReportNotFoundException,
  RouteVoiceReportStorageFailedException,
} from './route-voice-report.exceptions'

/**
 * Map Azure SDK failures to safe domain exceptions.
 * Never forward connection strings, account keys, URLs, or raw Azure bodies.
 */
export function mapRouteVoiceReportAzureStorageError(error: unknown): never {
  if (
    error instanceof RouteVoiceReportNotFoundException ||
    error instanceof RouteVoiceReportStorageFailedException
  ) {
    throw error
  }

  const statusCode = readStatusCode(error)
  const code = readErrorCode(error)

  if (
    statusCode === 404 ||
    code === 'BlobNotFound' ||
    code === 'ContainerNotFound'
  ) {
    throw new RouteVoiceReportNotFoundException()
  }

  throw new RouteVoiceReportStorageFailedException()
}

function readStatusCode(error: unknown): number | undefined {
  if (error instanceof RestError && typeof error.statusCode === 'number') {
    return error.statusCode
  }
  if (!error || typeof error !== 'object' || !('statusCode' in error)) {
    return undefined
  }
  return typeof error.statusCode === 'number' ? error.statusCode : undefined
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined
  }
  return typeof error.code === 'string' ? error.code : undefined
}

export function isBlobAlreadyExistsError(error: unknown): boolean {
  if (error instanceof RestError) {
    return (
      error.statusCode === 409 ||
      error.code === 'BlobAlreadyExists' ||
      error.code === 'ConditionNotMet'
    )
  }
  if (!error || typeof error !== 'object') {
    return false
  }
  const statusCode =
    'statusCode' in error ? error.statusCode : undefined
  const code = 'code' in error ? error.code : undefined
  return (
    statusCode === 409 ||
    code === 'BlobAlreadyExists' ||
    code === 'ConditionNotMet'
  )
}
