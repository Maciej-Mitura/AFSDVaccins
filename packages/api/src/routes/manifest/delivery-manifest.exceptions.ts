import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common'

/**
 * Phase 29A delivery-manifest errors — stable `error` codes only.
 * Never include token, nonce, signing, or PDF library stack details.
 */

export class DeliveryManifestRouteNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Delivery route not found for manifest.',
      error: 'DELIVERY_MANIFEST_ROUTE_NOT_FOUND',
    })
  }
}

export class DeliveryManifestStopNotFoundException extends NotFoundException {
  constructor() {
    super({
      message: 'Delivery stop not found for manifest.',
      error: 'DELIVERY_MANIFEST_STOP_NOT_FOUND',
    })
  }
}

export class DeliveryManifestForbiddenException extends ForbiddenException {
  constructor() {
    super({
      message: 'You do not have access to this delivery manifest.',
      error: 'DELIVERY_MANIFEST_FORBIDDEN',
    })
  }
}

export class DeliveryManifestRouteUnavailableException extends BadRequestException {
  constructor() {
    super({
      message: 'Delivery route is unavailable for manifest generation.',
      error: 'DELIVERY_MANIFEST_ROUTE_UNAVAILABLE',
    })
  }
}

export class DeliveryManifestOrderIntegrityException extends BadRequestException {
  constructor() {
    super({
      message: 'Associated order data is incomplete for this manifest.',
      error: 'DELIVERY_MANIFEST_ORDER_INTEGRITY_ERROR',
    })
  }
}

export class DeliveryManifestQuantityMismatchException extends BadRequestException {
  constructor() {
    super({
      message: 'Manifest quantity totals do not match the persisted route stop.',
      error: 'DELIVERY_MANIFEST_QUANTITY_MISMATCH',
    })
  }
}

export class DeliveryManifestQrUnavailableException extends BadRequestException {
  constructor() {
    super({
      message: 'Stop QR data is unavailable for this manifest.',
      error: 'DELIVERY_MANIFEST_QR_UNAVAILABLE',
    })
  }
}

export class DeliveryManifestGenerationFailedException extends InternalServerErrorException {
  constructor() {
    super({
      message: 'Delivery manifest generation failed.',
      error: 'DELIVERY_MANIFEST_GENERATION_FAILED',
    })
  }
}

export class DeliveryManifestTooLargeException extends PayloadTooLargeException {
  constructor() {
    super({
      message: 'Delivery manifest exceeds the allowed size.',
      error: 'DELIVERY_MANIFEST_TOO_LARGE',
    })
  }
}
