import { DeliveryRoute } from '../delivery-route.entity'
import { DeliveryRouteEventsService } from '../delivery-route-events.service'
import { redactDeliveryRouteForEvents } from './redact-delivery-route-for-events'
import { DELIVERY_QR_TOKEN_VERSION } from './delivery-qr.constants'

describe('redactDeliveryRouteForEvents', () => {
  const route = {
    id: '507f1f77bcf86cd799439011',
    _id: '507f1f77bcf86cd799439011',
    stops: [
      {
        stopId: 'stop-1',
        sequence: 1,
        apothekerProfileId: 'p1',
        apothekerUserId: 'u1',
        pharmacyName: 'Apotheek',
        address: {
          street: 'x',
          houseNumber: '1',
          postalCode: '9000',
          city: 'Gent',
          country: 'BE',
        },
        orderIds: ['o1'],
        orderCount: 1,
        totalQuantity: 1,
        lines: [],
        qrConfirmation: {
          tokenVersion: DELIVERY_QR_TOKEN_VERSION,
          nonceHash: 'a'.repeat(64),
          encodedToken: 'bearer.credential.token',
          issuedAt: new Date('2026-07-25T10:00:00.000Z'),
          consumedAt: null,
          consumedByUserId: null,
        },
      },
    ],
  } as unknown as DeliveryRoute

  it('removes encodedToken from event projections', () => {
    const redacted = redactDeliveryRouteForEvents(route)
    expect(redacted.stops[0].qrConfirmation).toBeDefined()
    expect(redacted.stops[0].qrConfirmation).not.toHaveProperty('encodedToken')
    expect(JSON.stringify(redacted)).not.toContain('bearer.credential.token')
    // Original route remains intact for persistence callers.
    expect(route.stops[0].qrConfirmation?.encodedToken).toBe(
      'bearer.credential.token',
    )
  })

  it('DeliveryRouteEventsService never publishes encodedToken', async () => {
    const publish = jest.fn().mockResolvedValue(undefined)
    const service = new DeliveryRouteEventsService({ publish } as never)

    await service.publishBezorgerRouteUpdated(route)

    expect(publish).toHaveBeenCalledTimes(1)
    const publishedArgs = publish.mock.calls[0] as unknown as [
      string,
      { bezorgerRouteUpdates: DeliveryRoute },
    ]
    const payload = publishedArgs[1]
    expect(JSON.stringify(payload)).not.toContain('bearer.credential.token')
    expect(
      payload.bezorgerRouteUpdates.stops[0].qrConfirmation,
    ).not.toHaveProperty('encodedToken')
  })
})
