import { createHmac } from 'node:crypto'

import {
  DELIVERY_QR_TEST_SIGNING_SECRET,
  DELIVERY_QR_TOKEN_VERSION,
} from './delivery-qr.constants'
import {
  DeliveryQrSigningConfigurationException,
  DeliveryQrTokenInvalidException,
  DeliveryQrTokenUnsupportedVersionException,
} from './delivery-qr.exceptions'
import { HmacDeliveryQrTokenService } from './hmac-delivery-qr-token.service'

const SECRET = DELIVERY_QR_TEST_SIGNING_SECRET

describe('HmacDeliveryQrTokenService', () => {
  const service = new HmacDeliveryQrTokenService(SECRET)

  const claims = {
    routeId: '507f1f77bcf86cd799439011',
    stopId: '607f1f77bcf86cd799439022',
    nonce: 'dGVzdC1ub25jZS1ieXRlcy1mb3ItdW5pdA',
  }

  it('signs a payload containing only version, routeId, stopId, and nonce', () => {
    const token = service.sign(claims)
    const [encoded] = token.split('.')
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>

    expect(Object.keys(payload).sort()).toEqual([
      'nonce',
      'routeId',
      'stopId',
      'v',
    ])
    expect(payload).toEqual({
      v: DELIVERY_QR_TOKEN_VERSION,
      routeId: claims.routeId,
      stopId: claims.stopId,
      nonce: claims.nonce,
    })
  })

  it('cryptographically signs the token (HMAC-SHA-256)', () => {
    const token = service.sign(claims)
    const [encoded, signature] = token.split('.')
    const expected = createHmac('sha256', SECRET)
      .update(encoded, 'utf8')
      .digest('base64url')

    expect(signature).toBe(expected)
    expect(service.verify(token)).toEqual({
      v: DELIVERY_QR_TOKEN_VERSION,
      ...claims,
    })
  })

  it('rejects tokens when routeId is modified', () => {
    const token = service.sign(claims)
    const [encoded] = token.split('.')
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>
    payload.routeId = '507f1f77bcf86cd799439099'
    const tampered = `${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.${token.split('.')[1]}`

    expect(() => service.verify(tampered)).toThrow(
      DeliveryQrTokenInvalidException,
    )
  })

  it('rejects tokens when stopId is modified', () => {
    const token = service.sign(claims)
    const [encoded] = token.split('.')
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>
    payload.stopId = '607f1f77bcf86cd799439099'
    const tampered = `${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.${token.split('.')[1]}`

    expect(() => service.verify(tampered)).toThrow(
      DeliveryQrTokenInvalidException,
    )
  })

  it('rejects tokens when nonce is modified', () => {
    const token = service.sign(claims)
    const [encoded] = token.split('.')
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>
    payload.nonce = 'tampered-nonce-value-without-valid-sig'
    const tampered = `${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.${token.split('.')[1]}`

    expect(() => service.verify(tampered)).toThrow(
      DeliveryQrTokenInvalidException,
    )
  })

  it('rejects unsupported token versions', () => {
    expect(() =>
      service.sign({ ...claims, version: 99 as 1 }),
    ).toThrow(DeliveryQrTokenUnsupportedVersionException)

    const encoded = Buffer.from(
      JSON.stringify({
        v: 99,
        routeId: claims.routeId,
        stopId: claims.stopId,
        nonce: claims.nonce,
      }),
      'utf8',
    ).toString('base64url')
    const signature = createHmac('sha256', SECRET)
      .update(encoded, 'utf8')
      .digest('base64url')

    expect(() => service.verify(`${encoded}.${signature}`)).toThrow(
      DeliveryQrTokenUnsupportedVersionException,
    )
  })

  it('rejects malformed tokens safely', () => {
    for (const token of [
      '',
      'not-a-token',
      'onlyonepart',
      '...',
      '@@@.@@@',
      `${Buffer.from('{', 'utf8').toString('base64url')}.sig`,
    ]) {
      expect(() => service.verify(token)).toThrow(DeliveryQrTokenInvalidException)
    }
  })

  it('never includes the signing secret in token output or error payloads', () => {
    const token = service.sign(claims)
    expect(token).not.toContain(SECRET)

    try {
      service.verify('bad.token')
      throw new Error('expected verify to throw')
    } catch (error) {
      const serialised = JSON.stringify(error)
      expect(serialised).not.toContain(SECRET)
      expect(String(error)).not.toContain(SECRET)
    }

    try {
      new HmacDeliveryQrTokenService('short')
    } catch (error) {
      expect(String(error)).not.toContain(SECRET)
      expect(error).toBeInstanceOf(DeliveryQrSigningConfigurationException)
    }
  })

  it('accepts explicit deterministic test secret injection', () => {
    const other = new HmacDeliveryQrTokenService(
      'another-deterministic-test-secret-32b!',
    )
    const token = other.sign(claims)
    expect(other.verify(token).routeId).toBe(claims.routeId)
    expect(() => service.verify(token)).toThrow(DeliveryQrTokenInvalidException)
  })
})
