import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'

/**
 * Domain errors for vaccine image AI analysis.
 * Messages never include API keys, endpoints with query data, raw Azure bodies,
 * or image bytes.
 */

export class VaccineImageAnalysisConfigurationException extends BadRequestException {
  constructor(message: string) {
    super({
      message,
      error: 'VACCINE_IMAGE_ANALYSIS_CONFIGURATION_INVALID',
    })
  }
}

export class VaccineImageAnalysisInvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super({
      message: 'Vaccine image analysis credentials are invalid',
      error: 'VACCINE_IMAGE_ANALYSIS_INVALID_CREDENTIALS',
    })
  }
}

export class VaccineImageAnalysisPermissionDeniedException extends ForbiddenException {
  constructor() {
    super({
      message: 'Vaccine image analysis permission denied',
      error: 'VACCINE_IMAGE_ANALYSIS_PERMISSION_DENIED',
    })
  }
}

export class VaccineImageAnalysisRateLimitedException extends HttpException {
  constructor() {
    super(
      {
        message: 'Vaccine image analysis rate limit exceeded',
        error: 'VACCINE_IMAGE_ANALYSIS_RATE_LIMITED',
      },
      429,
    )
  }
}

export class VaccineImageAnalysisTimeoutException extends ServiceUnavailableException {
  constructor() {
    super({
      message: 'Vaccine image analysis timed out',
      error: 'VACCINE_IMAGE_ANALYSIS_TIMEOUT',
    })
  }
}

export class VaccineImageAnalysisUnsupportedImageException extends BadRequestException {
  constructor() {
    super({
      message: 'Vaccine image is unsupported by the analysis provider',
      error: 'VACCINE_IMAGE_ANALYSIS_UNSUPPORTED_IMAGE',
    })
  }
}

export class VaccineImageAnalysisMalformedResponseException extends BadRequestException {
  constructor() {
    super({
      message: 'Vaccine image analysis returned a malformed response',
      error: 'VACCINE_IMAGE_ANALYSIS_MALFORMED_RESPONSE',
    })
  }
}

export class VaccineImageAnalysisUnavailableException extends ServiceUnavailableException {
  constructor() {
    super({
      message: 'Vaccine image analysis is temporarily unavailable',
      error: 'VACCINE_IMAGE_ANALYSIS_UNAVAILABLE',
    })
  }
}

export class VaccineImageAnalysisProviderException extends BadRequestException {
  constructor(message = 'Vaccine image analysis provider failed') {
    super({
      message,
      error: 'VACCINE_IMAGE_ANALYSIS_PROVIDER_FAILED',
    })
  }
}

/** True when the error is already a vaccine-image analysis domain exception. */
export function isVaccineImageAnalysisDomainException(
  error: unknown,
): error is HttpException {
  return (
    error instanceof VaccineImageAnalysisConfigurationException ||
    error instanceof VaccineImageAnalysisInvalidCredentialsException ||
    error instanceof VaccineImageAnalysisPermissionDeniedException ||
    error instanceof VaccineImageAnalysisRateLimitedException ||
    error instanceof VaccineImageAnalysisTimeoutException ||
    error instanceof VaccineImageAnalysisUnsupportedImageException ||
    error instanceof VaccineImageAnalysisMalformedResponseException ||
    error instanceof VaccineImageAnalysisUnavailableException ||
    error instanceof VaccineImageAnalysisProviderException
  )
}

/** Safe stable error code for audit / classification (never secrets). */
export function vaccineImageAnalysisErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'VACCINE_IMAGE_ANALYSIS_PROVIDER_FAILED'
  }
  const response = (error as HttpException).getResponse?.()
  if (response && typeof response === 'object' && 'error' in response) {
    const code = (response as { error?: unknown }).error
    if (typeof code === 'string' && code.length > 0) {
      return code
    }
  }
  return 'VACCINE_IMAGE_ANALYSIS_PROVIDER_FAILED'
}
