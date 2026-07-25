import { RestError } from '@azure/storage-blob'

import {
  VaccineImageBlobAlreadyExistsException,
  VaccineImageBlobNotFoundException,
  VaccineImageStorageOperationException,
  VaccineImageStoragePermissionDeniedException,
  VaccineImageStorageUnavailableException,
} from './vaccine-image-storage.exceptions'

/**
 * Map Azure SDK failures to safe domain exceptions.
 * Never forward connection strings, account keys, SAS query strings, or raw Azure bodies.
 */
export function mapAzureStorageError(error: unknown): never {
  if (
    error instanceof VaccineImageBlobAlreadyExistsException ||
    error instanceof VaccineImageBlobNotFoundException ||
    error instanceof VaccineImageStoragePermissionDeniedException ||
    error instanceof VaccineImageStorageUnavailableException ||
    error instanceof VaccineImageStorageOperationException
  ) {
    throw error
  }

  const statusCode = readStatusCode(error)
  const code = readErrorCode(error)

  if (statusCode === 404 || code === 'BlobNotFound' || code === 'ContainerNotFound') {
    throw new VaccineImageBlobNotFoundException()
  }

  if (
    statusCode === 409 ||
    code === 'BlobAlreadyExists' ||
    code === 'ConditionNotMet'
  ) {
    throw new VaccineImageBlobAlreadyExistsException()
  }

  if (statusCode === 401 || statusCode === 403 || code === 'AuthorizationFailure') {
    throw new VaccineImageStoragePermissionDeniedException()
  }

  if (
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    isNetworkFailure(error)
  ) {
    throw new VaccineImageStorageUnavailableException()
  }

  throw new VaccineImageStorageOperationException()
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

function isNetworkFailure(error: unknown): boolean {
  const code = readErrorCode(error)
  return (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN'
  )
}
