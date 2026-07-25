import {
  DELIVERY_QR_TEST_SIGNING_SECRET,
  DELIVERY_QR_TOKEN_VERSION,
} from './delivery-qr.constants'
import { createGeneratedStopQrState } from './create-generated-stop-qr-state'
import {
  generateDeliveryQrNonce,
  hashDeliveryQrNonce,
  type DeliveryQrRandomSource,
} from './delivery-qr-nonce.util'
import { HmacDeliveryQrTokenService } from './hmac-delivery-qr-token.service'
import { verifyPersistedStopQrToken } from './verify-persisted-stop-qr-token'
import { StopQrInvariantViolationException } from './delivery-qr.exceptions'

describe('delivery QR nonce utilities + mint-on-generate', () => {
  const tokenService = new HmacDeliveryQrTokenService(
    DELIVERY_QR_TEST_SIGNING_SECRET,
  )

  function makeRandom(): DeliveryQrRandomSource {
    let counter = 0
    return {
      randomBytes: size => {
        const buffer = Buffer.alloc(size)
        buffer.writeUInt32BE(counter, 0)
        counter += 1
        return buffer
      },
      randomStopId: () => {
        const id = `stop-${counter}`
        counter += 1
        return id
      },
    }
  }

  it('generates unpredictable unique nonces', () => {
    const nonces = new Set<string>()
    for (let i = 0; i < 50; i += 1) {
      nonces.add(generateDeliveryQrNonce())
    }
    expect(nonces.size).toBe(50)
  })

  it('hashes nonces as SHA-256 hex digests', () => {
    const hash = hashDeliveryQrNonce('unit-test-nonce')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).toBe(hashDeliveryQrNonce('unit-test-nonce'))
    expect(hash).not.toBe(hashDeliveryQrNonce('other-nonce'))
  })

  it('creates nonceHash and encodedToken together and discards plaintext nonce', () => {
    const random = makeRandom()
    const routeId = '507f1f77bcf86cd799439011'
    const state = createGeneratedStopQrState({
      routeId,
      tokenService,
      random,
    })

    expect(state.qrConfirmation.tokenVersion).toBe(DELIVERY_QR_TOKEN_VERSION)
    expect(state.qrConfirmation.nonceHash).toMatch(/^[a-f0-9]{64}$/i)
    expect(state.qrConfirmation.encodedToken).toContain('.')
    expect(state.qrConfirmation.consumedAt).toBeNull()
    expect(state).not.toHaveProperty('nonce')

    const serialised = JSON.stringify(state)
    expect(serialised).not.toMatch(/"nonce":/)

    const payload = verifyPersistedStopQrToken(
      tokenService,
      state.qrConfirmation,
      { routeId, stopId: state.stopId },
    )
    expect(hashDeliveryQrNonce(payload.nonce)).toBe(
      state.qrConfirmation.nonceHash,
    )
  })

  it('assigns different signed tokens to different stops', () => {
    const random = makeRandom()
    const routeId = '507f1f77bcf86cd799439011'
    const first = createGeneratedStopQrState({ routeId, tokenService, random })
    const second = createGeneratedStopQrState({ routeId, tokenService, random })

    expect(first.stopId).not.toBe(second.stopId)
    expect(first.qrConfirmation.nonceHash).not.toBe(
      second.qrConfirmation.nonceHash,
    )
    expect(first.qrConfirmation.encodedToken).not.toBe(
      second.qrConfirmation.encodedToken,
    )
  })

  it('assigns different signed tokens to different routes', () => {
    const random = makeRandom()
    const first = createGeneratedStopQrState({
      routeId: '507f1f77bcf86cd799439011',
      tokenService,
      random,
    })
    const second = createGeneratedStopQrState({
      routeId: '507f1f77bcf86cd799439012',
      tokenService,
      random,
    })

    expect(first.qrConfirmation.encodedToken).not.toBe(
      second.qrConfirmation.encodedToken,
    )
    expect(
      tokenService.verify(first.qrConfirmation.encodedToken).routeId,
    ).toBe('507f1f77bcf86cd799439011')
    expect(
      tokenService.verify(second.qrConfirmation.encodedToken).routeId,
    ).toBe('507f1f77bcf86cd799439012')
  })

  it('rejects tampered persisted tokens against nonceHash validation', () => {
    const state = createGeneratedStopQrState({
      routeId: '507f1f77bcf86cd799439011',
      tokenService,
      random: makeRandom(),
    })

    const tampered = {
      ...state.qrConfirmation,
      encodedToken: `${state.qrConfirmation.encodedToken}x`,
    }

    expect(() => verifyPersistedStopQrToken(tokenService, tampered)).toThrow()

    const wrongHash = {
      ...state.qrConfirmation,
      nonceHash: 'b'.repeat(64),
    }

    expect(() => verifyPersistedStopQrToken(tokenService, wrongHash)).toThrow(
      StopQrInvariantViolationException,
    )
  })
})
