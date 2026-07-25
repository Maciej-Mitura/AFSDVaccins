import { createHmac } from 'node:crypto'

import {
  DELIVERY_QR_TEST_SIGNING_SECRET,
  DELIVERY_QR_TOKEN_VERSION,
} from './delivery-qr.constants'
import { hashDeliveryQrNonce } from './delivery-qr-nonce.util'
import {
  DeliveryQrPreviewTokenInvalidException,
  DeliveryQrVersionUnsupportedException,
} from './delivery-qr-preview.exceptions'
import { HmacDeliveryQrTokenService } from './hmac-delivery-qr-token.service'
import type { StopQrConfirmation } from './stop-qr-confirmation.embed'
import {
  safeEqualHex,
  verifySubmittedStopQrToken,
} from './verify-submitted-stop-qr-token'

const SECRET = DELIVERY_QR_TEST_SIGNING_SECRET

describe('verifySubmittedStopQrToken', () => {
  const tokenService = new HmacDeliveryQrTokenService(SECRET)
  const claims = {
    routeId: '507f1f77bcf86cd799439011',
    stopId: '607f1f77bcf86cd799439022',
    nonce: 'dGVzdC1ub25jZS1ieXRlcy1mb3ItdW5pdA',
  }

  function confirmationFor(token: string, nonce: string): StopQrConfirmation {
    return {
      tokenVersion: DELIVERY_QR_TOKEN_VERSION,
      nonceHash: hashDeliveryQrNonce(nonce),
      encodedToken: token,
      issuedAt: new Date('2026-07-26T08:00:00.000Z'),
      consumedAt: null,
      consumedByUserId: null,
    }
  }

  it('accepts a submitted token whose nonce hashes to the persisted nonceHash', () => {
    const token = tokenService.sign(claims)
    const confirmation = confirmationFor(token, claims.nonce)

    expect(
      verifySubmittedStopQrToken(tokenService, token, confirmation, {
        routeId: claims.routeId,
        stopId: claims.stopId,
      }),
    ).toEqual({ v: DELIVERY_QR_TOKEN_VERSION, ...claims })
  })

  it('does not rely solely on encodedToken string equality', () => {
    const token = tokenService.sign(claims)
    const confirmation = confirmationFor(token, claims.nonce)
    // Persisted wire copy differs but nonceHash still matches the submitted token.
    confirmation.encodedToken = `${token}x`

    expect(
      verifySubmittedStopQrToken(tokenService, token, confirmation, {
        routeId: claims.routeId,
        stopId: claims.stopId,
      }),
    ).toEqual({ v: DELIVERY_QR_TOKEN_VERSION, ...claims })
  })

  it('rejects when the submitted nonce does not match nonceHash', () => {
    const token = tokenService.sign(claims)
    const confirmation = confirmationFor(token, claims.nonce)
    confirmation.nonceHash = hashDeliveryQrNonce('other-nonce')

    expect(() =>
      verifySubmittedStopQrToken(tokenService, token, confirmation, {
        routeId: claims.routeId,
        stopId: claims.stopId,
      }),
    ).toThrow(DeliveryQrPreviewTokenInvalidException)
  })

  it('rejects modified signatures', () => {
    const token = tokenService.sign(claims)
    const confirmation = confirmationFor(token, claims.nonce)
    const [encoded] = token.split('.')
    const badSig = createHmac('sha256', 'wrong-secret-not-the-real-one!!')
      .update(encoded, 'utf8')
      .digest('base64url')
    const tampered = `${encoded}.${badSig}`

    expect(() =>
      verifySubmittedStopQrToken(tokenService, tampered, confirmation, {
        routeId: claims.routeId,
        stopId: claims.stopId,
      }),
    ).toThrow(DeliveryQrPreviewTokenInvalidException)
  })

  it('rejects unsupported stored token versions', () => {
    const token = tokenService.sign(claims)
    const confirmation = confirmationFor(token, claims.nonce)
    confirmation.tokenVersion = 99

    expect(() =>
      verifySubmittedStopQrToken(tokenService, token, confirmation, {
        routeId: claims.routeId,
        stopId: claims.stopId,
      }),
    ).toThrow(DeliveryQrVersionUnsupportedException)
  })
})

describe('safeEqualHex', () => {
  it('returns true for equal digests and false otherwise', () => {
    const digest = 'a'.repeat(64)
    expect(safeEqualHex(digest, digest)).toBe(true)
    expect(safeEqualHex(digest, 'b'.repeat(64))).toBe(false)
    expect(safeEqualHex(digest, 'a'.repeat(63))).toBe(false)
  })
})
