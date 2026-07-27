import { Throttle } from '@nestjs/throttler'

import { THROTTLER_STRICT } from '../../common/throttling/throttling.constants'

/**
 * Voice-report upload / stream throttle: 20 requests per 10 minutes per identity.
 * Allows several reports per active route without matching image-upload strictness.
 */
export const ROUTE_VOICE_REPORT_UPLOAD_THROTTLE_LIMIT = 20
export const ROUTE_VOICE_REPORT_UPLOAD_THROTTLE_TTL_MS = 600_000

export function RouteVoiceReportUploadThrottle(): MethodDecorator {
  return Throttle({
    [THROTTLER_STRICT]: {
      limit: ROUTE_VOICE_REPORT_UPLOAD_THROTTLE_LIMIT,
      ttl: ROUTE_VOICE_REPORT_UPLOAD_THROTTLE_TTL_MS,
    },
  })
}
