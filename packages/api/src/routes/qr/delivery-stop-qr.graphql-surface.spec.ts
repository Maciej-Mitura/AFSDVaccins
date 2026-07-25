import { LazyMetadataStorage } from '@nestjs/graphql/dist/schema-builder/storages/lazy-metadata.storage'
import { TypeMetadataStorage } from '@nestjs/graphql'

import { DeliveryStop } from '../delivery-stop.embed'
import { RouteTemplateStop } from '../../route-templates/route-template-stop.embed'
import { DeliveryStopQrFieldsResolver } from './delivery-stop-qr-fields.resolver'
import { DeliveryStopQr } from './delivery-stop-qr.type'
import '../order-line-snapshot.embed'
import '../../profile/address.type'

describe('DeliveryStop QR GraphQL surface', () => {
  let stopFieldNames: Set<string>
  let templateStopFieldNames: Set<string>
  let stopQrFieldNames: Set<string>

  beforeAll(() => {
    LazyMetadataStorage.load()
    TypeMetadataStorage.compile([
      DeliveryStop,
      RouteTemplateStop,
      DeliveryStopQr,
    ])

    stopFieldNames = new Set(
      (
        TypeMetadataStorage.getObjectTypeMetadataByTarget(DeliveryStop)
          ?.properties ?? []
      ).map(property => property.name),
    )

    templateStopFieldNames = new Set(
      (
        TypeMetadataStorage.getObjectTypeMetadataByTarget(RouteTemplateStop)
          ?.properties ?? []
      ).map(property => property.name),
    )

    stopQrFieldNames = new Set(
      (
        TypeMetadataStorage.getObjectTypeMetadataByTarget(DeliveryStopQr)
          ?.properties ?? []
      ).map(property => property.name),
    )
  })

  it('exposes stopId and never exposes nonce or signing material on DeliveryStop', () => {
    expect(stopFieldNames.has('stopId')).toBe(true)

    for (const name of [
      'qrConfirmation',
      'deliveryProof',
      'nonce',
      'nonceHash',
      'encodedToken',
      'tokenVersion',
      'consumedByUserId',
      'signingSecret',
      'DELIVERY_QR_SIGNING_SECRET',
    ]) {
      expect(stopFieldNames.has(name)).toBe(false)
    }
  })

  it('exposes QR readiness via ResolveField helpers only', () => {
    expect(typeof DeliveryStopQrFieldsResolver.prototype.qrAvailable).toBe(
      'function',
    )
    expect(typeof DeliveryStopQrFieldsResolver.prototype.qrConsumed).toBe(
      'function',
    )
    expect(typeof DeliveryStopQrFieldsResolver.prototype.deliveredAt).toBe(
      'function',
    )
    expect(stopFieldNames.has('qrAvailable')).toBe(false)
    expect(stopFieldNames.has('qrConsumed')).toBe(false)
    expect(stopFieldNames.has('deliveredAt')).toBe(false)
  })

  it('keeps RouteTemplateStop free of QR confirmation state', () => {
    expect(templateStopFieldNames.has('apothekerProfileId')).toBe(true)
    expect(templateStopFieldNames.has('sequence')).toBe(true)

    for (const name of [
      'stopId',
      'qrConfirmation',
      'deliveryProof',
      'nonceHash',
      'qrAvailable',
      'qrConsumed',
    ]) {
      expect(templateStopFieldNames.has(name)).toBe(false)
    }
  })

  it('exposes only safe DeliveryStopQr metadata fields', () => {
    for (const name of [
      'routeId',
      'stopId',
      'routeDate',
      'pharmacyName',
      'address',
      'orderCount',
      'orderIds',
      'qrAvailable',
      'qrConsumed',
      'issuedAt',
      'qrImagePath',
    ]) {
      expect(stopQrFieldNames.has(name)).toBe(true)
    }

    for (const name of [
      'encodedToken',
      'nonceHash',
      'nonce',
      'qrConfirmation',
      'tokenVersion',
      'consumedByUserId',
    ]) {
      expect(stopQrFieldNames.has(name)).toBe(false)
    }
  })
})
