import {
  isVaccineImageAnalysisDomainException,
  VaccineImageAnalysisInvalidCredentialsException,
  VaccineImageAnalysisMalformedResponseException,
  VaccineImageAnalysisPermissionDeniedException,
  VaccineImageAnalysisProviderException,
  VaccineImageAnalysisRateLimitedException,
  VaccineImageAnalysisTimeoutException,
  VaccineImageAnalysisUnavailableException,
  VaccineImageAnalysisUnsupportedImageException,
} from './vaccine-image-analysis.exceptions'

/**
 * Map Azure Vision / network failures to safe domain exceptions.
 * Never forward API keys, endpoint query strings, raw bodies, or image bytes.
 */
export function mapAzureVisionError(error: unknown): never {
  if (isVaccineImageAnalysisDomainException(error)) {
    throw error
  }

  if (isTimeoutError(error)) {
    throw new VaccineImageAnalysisTimeoutException()
  }

  const statusCode = readStatusCode(error)
  const code = readErrorCode(error)
  const message = readErrorMessage(error).toLowerCase()

  if (statusCode === 401 || code === '401' || code === 'Unauthorized') {
    throw new VaccineImageAnalysisInvalidCredentialsException()
  }

  if (
    statusCode === 403 ||
    code === '403' ||
    code === 'Forbidden' ||
    code === 'AuthorizationDenied'
  ) {
    throw new VaccineImageAnalysisPermissionDeniedException()
  }

  if (statusCode === 429 || code === '429' || code === 'TooManyRequests') {
    throw new VaccineImageAnalysisRateLimitedException()
  }

  if (
    statusCode === 400 &&
    (isUnsupportedImageHint(code, message) ||
      message.includes('invalid image') ||
      message.includes('unsupported'))
  ) {
    throw new VaccineImageAnalysisUnsupportedImageException()
  }

  if (
    statusCode === 408 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    isNetworkFailure(error)
  ) {
    throw new VaccineImageAnalysisUnavailableException()
  }

  if (code === 'MalformedResponse' || message.includes('malformed')) {
    throw new VaccineImageAnalysisMalformedResponseException()
  }

  throw new VaccineImageAnalysisProviderException()
}

function isUnsupportedImageHint(code: string | undefined, message: string): boolean {
  if (!code && message.length === 0) {
    return false
  }
  const haystack = `${code ?? ''} ${message}`.toLowerCase()
  return (
    haystack.includes('invalidimage') ||
    haystack.includes('invalid image') ||
    haystack.includes('unsupportedmediatype') ||
    haystack.includes('unsupported media') ||
    haystack.includes('not a valid image') ||
    haystack.includes('imagesize') ||
    haystack.includes('imagedimension')
  )
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const name = 'name' in error ? error.name : undefined
  const code = readErrorCode(error)
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    code === 'ABORT_ERR' ||
    code === 'ETIMEDOUT' ||
    code === 'TimeoutError'
  )
}

function readStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode
  }

  if ('status' in error) {
    const status = error.status
    if (typeof status === 'number') {
      return status
    }
    if (typeof status === 'string') {
      const parsed = Number.parseInt(status, 10)
      return Number.isFinite(parsed) ? parsed : undefined
    }
  }

  // Azure REST unexpected body often nests under body.error.code / response
  if ('body' in error && error.body && typeof error.body === 'object') {
    const body = error.body as { statusCode?: unknown; error?: { code?: unknown } }
    if (typeof body.statusCode === 'number') {
      return body.statusCode
    }
  }

  return undefined
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  if ('code' in error && typeof error.code === 'string') {
    return error.code
  }

  if ('body' in error && error.body && typeof error.body === 'object') {
    const body = error.body as {
      error?: { code?: unknown }
      code?: unknown
    }
    if (typeof body.error?.code === 'string') {
      return body.error.code
    }
    if (typeof body.code === 'string') {
      return body.code
    }
  }

  return undefined
}

function readErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return ''
  }
  if ('message' in error && typeof error.message === 'string') {
    return error.message
  }
  if ('body' in error && error.body && typeof error.body === 'object') {
    const body = error.body as {
      error?: { message?: unknown }
      message?: unknown
    }
    if (typeof body.error?.message === 'string') {
      return body.error.message
    }
    if (typeof body.message === 'string') {
      return body.message
    }
  }
  return ''
}

function isNetworkFailure(error: unknown): boolean {
  const code = readErrorCode(error)
  return (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'EAI_AGAIN'
  )
}
