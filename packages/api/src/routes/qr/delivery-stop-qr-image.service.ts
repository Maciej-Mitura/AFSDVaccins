import { Injectable } from '@nestjs/common'
import { toBuffer as qrToBuffer, toString as qrToString } from 'qrcode'

import {
  DELIVERY_STOP_QR_ERROR_CORRECTION,
  DELIVERY_STOP_QR_MARGIN_MODULES,
  DELIVERY_STOP_QR_SIZE_PX,
} from './delivery-stop-qr-image.constants'

export type DeliveryStopQrRenderOptions = {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  margin?: number
  width?: number
}

/**
 * On-demand QR image rendering from a persisted encodedToken.
 * Never remints tokens; never persists images; never logs the token.
 */
@Injectable()
export class DeliveryStopQrImageService {
  async renderSvg(
    encodedToken: string,
    options: DeliveryStopQrRenderOptions = {},
  ): Promise<string> {
    const errorCorrectionLevel =
      options.errorCorrectionLevel ?? DELIVERY_STOP_QR_ERROR_CORRECTION
    const margin = options.margin ?? DELIVERY_STOP_QR_MARGIN_MODULES
    const width = options.width ?? DELIVERY_STOP_QR_SIZE_PX

    const svg = await qrToString(encodedToken, {
      type: 'svg',
      errorCorrectionLevel,
      margin,
      width,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })

    if (typeof svg !== 'string' || svg.length === 0) {
      throw new Error('QR SVG rendering failed.')
    }

    return svg
  }

  /**
   * PNG buffer for focused decode/round-trip tests (same ECC/margin/width as SVG).
   * Not used by the HTTP retrieval endpoint.
   */
  async renderPngBuffer(
    encodedToken: string,
    options: DeliveryStopQrRenderOptions = {},
  ): Promise<Buffer> {
    const errorCorrectionLevel =
      options.errorCorrectionLevel ?? DELIVERY_STOP_QR_ERROR_CORRECTION
    const margin = options.margin ?? DELIVERY_STOP_QR_MARGIN_MODULES
    const width = options.width ?? DELIVERY_STOP_QR_SIZE_PX

    return qrToBuffer(encodedToken, {
      type: 'png',
      errorCorrectionLevel,
      margin,
      width,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
  }
}
