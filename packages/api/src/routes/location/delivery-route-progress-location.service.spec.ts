import { ObjectId } from 'mongodb'

import { UserRole } from '../../user/user-role.enum'
import { DeliveryRoute } from '../delivery-route.entity'
import { RouteStatus } from '../route-status.enum'
import { DeliveryRouteProgressLocationService } from './delivery-route-progress-location.service'
import { RouteLocationSource } from './route-location-source.enum'

describe('DeliveryRouteProgressLocationService', () => {
  const routeId = new ObjectId()
  const bezorgerProfileId = new ObjectId().toString()
  const courierUserId = new ObjectId().toString()

  function makeStop(
    sequence: number,
    stopId: string,
    city: string,
    extras: Record<string, unknown> = {},
  ) {
    return {
      stopId,
      sequence,
      apothekerProfileId: `profile-${stopId}`,
      apothekerUserId: `user-${stopId}`,
      pharmacyName: `Pharmacy ${stopId}`,
      address: {
        street: 'S',
        houseNumber: '1',
        postalCode: '9000',
        city,
        country: 'BE',
      },
      orderIds: [`order-${stopId}`],
      orderCount: 1,
      totalQuantity: 1,
      lines: [],
      arrival: null,
      deliveryProof: null,
      qrConfirmation: {
        tokenVersion: 1,
        issuedAt: new Date('2026-07-26T08:00:00.000Z'),
        nonceHash: 'h',
        encodedToken: 't',
        consumedAt: null,
        consumedByUserId: null,
      },
      ...extras,
    }
  }

  function makeRoute(
    overrides: Record<string, unknown> = {},
  ): DeliveryRoute {
    return {
      _id: routeId,
      id: routeId.toString(),
      bezorgerProfileId,
      status: RouteStatus.IN_PROGRESS,
      deliveryDate: '2026-07-26',
      stops: [
        makeStop(1, 's1', 'Brugge'),
        makeStop(2, 's2', 'Gent'),
        makeStop(3, 's3', 'Antwerpen'),
      ],
      lastKnownLocation: null,
      ...overrides,
    } as unknown as DeliveryRoute
  }

  function buildService(initialRoute: DeliveryRoute | null) {
    let currentRoute = initialRoute

    const deliveryRouteRepository = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(currentRoute)),
      updateOne: jest.fn().mockImplementation((_filter, update) => {
        if (!currentRoute) {
          return Promise.resolve({ modifiedCount: 0 })
        }
        const set = (update as { $set?: { lastKnownLocation?: unknown } }).$set
        if (set?.lastKnownLocation) {
          currentRoute = {
            ...currentRoute,
            lastKnownLocation: set.lastKnownLocation as DeliveryRoute['lastKnownLocation'],
          } as DeliveryRoute
        }
        return Promise.resolve({ modifiedCount: 1 })
      }),
    }

    const publishBezorgerRouteUpdated = jest.fn().mockResolvedValue(undefined)
    const auditRecord = jest.fn().mockResolvedValue({ inserted: true })

    const service = new DeliveryRouteProgressLocationService(
      deliveryRouteRepository as never,
      { publishBezorgerRouteUpdated } as never,
      { record: auditRecord } as never,
    )

    return {
      service,
      deliveryRouteRepository,
      publishBezorgerRouteUpdated,
      auditRecord,
      getRoute: () => currentRoute,
      setRoute: (route: DeliveryRoute | null) => {
        currentRoute = route
      },
    }
  }

  it('starts with no location', () => {
    const route = makeRoute()
    const { service } = buildService(route)
    const status = service.buildSafeLocationStatus(route)
    expect(status.hasLocation).toBe(false)
    expect(status.city).toBeNull()
    expect(status.hasNextStop).toBe(false)
  })

  it('records ARRIVAL city from stop snapshot, not a client city', async () => {
    const route = makeRoute()
    const { service, auditRecord, getRoute } = buildService(route)
    const stop = route.stops[0]

    const result = await service.recordArrivalLocation({
      route,
      stop,
      recordedAt: new Date('2026-07-26T10:00:00.000Z'),
      courierUserId,
      courierBezorgerProfileId: bezorgerProfileId,
      arrivalEventKey: 'idem-1',
      publishRouteUpdate: false,
    })

    expect(result.applied).toBe(true)
    expect(getRoute()?.lastKnownLocation?.city).toBe('Brugge')
    expect(getRoute()?.lastKnownLocation?.source).toBe(
      RouteLocationSource.ARRIVAL,
    )
    expect(getRoute()?.lastKnownLocation?.city).not.toBe('ClientForgedCity')
    expect(auditRecord).toHaveBeenCalledTimes(1)
  })

  it('records DELIVERY location and replaces ARRIVAL for same stop', async () => {
    const route = makeRoute()
    const { service, getRoute } = buildService(route)
    const stop = route.stops[0]
    const at = new Date('2026-07-26T10:00:00.000Z')

    await service.recordArrivalLocation({
      route,
      stop,
      recordedAt: at,
      courierUserId,
      courierBezorgerProfileId: bezorgerProfileId,
      arrivalEventKey: 'idem-1',
      publishRouteUpdate: false,
    })

    const afterArrival = getRoute()!
    await service.recordDeliveryLocation({
      route: afterArrival,
      stop,
      deliveredAt: at,
      courierUserId,
      courierBezorgerProfileId: bezorgerProfileId,
      confirmationEventId: 'confirm-1',
      publishRouteUpdate: false,
    })

    expect(getRoute()?.lastKnownLocation?.source).toBe(
      RouteLocationSource.DELIVERY,
    )
    expect(getRoute()?.lastKnownLocation?.city).toBe('Brugge')
  })

  it('does not overwrite newer location with an older event', async () => {
    const route = makeRoute()
    const { service, getRoute } = buildService(route)

    await service.recordArrivalLocation({
      route,
      stop: route.stops[1],
      recordedAt: new Date('2026-07-26T11:00:00.000Z'),
      courierUserId,
      courierBezorgerProfileId: bezorgerProfileId,
      arrivalEventKey: 'later',
      publishRouteUpdate: false,
    })

    const after = getRoute()!
    const result = await service.recordArrivalLocation({
      route: after,
      stop: route.stops[0],
      recordedAt: new Date('2026-07-26T10:00:00.000Z'),
      courierUserId,
      courierBezorgerProfileId: bezorgerProfileId,
      arrivalEventKey: 'older',
      publishRouteUpdate: false,
    })

    expect(result.applied).toBe(false)
    expect(getRoute()?.lastKnownLocation?.stopId).toBe('s2')
  })

  it('treats duplicate eventId as idempotent (no second audit)', async () => {
    const route = makeRoute()
    const { service, auditRecord } = buildService(route)

    await service.recordArrivalLocation({
      route,
      stop: route.stops[0],
      recordedAt: new Date('2026-07-26T10:00:00.000Z'),
      courierUserId,
      courierBezorgerProfileId: bezorgerProfileId,
      arrivalEventKey: 'same-key',
      publishRouteUpdate: false,
    })

    const again = await service.recordArrivalLocation({
      route: route,
      stop: route.stops[0],
      recordedAt: new Date('2026-07-26T10:00:00.000Z'),
      courierUserId,
      courierBezorgerProfileId: bezorgerProfileId,
      arrivalEventKey: 'same-key',
      publishRouteUpdate: false,
    })

    expect(again.applied).toBe(false)
    expect(auditRecord).toHaveBeenCalledTimes(1)
  })

  it('derives next stop after delivery and skips delivered later stops', async () => {
    const route = makeRoute({
      stops: [
        makeStop(1, 's1', 'Brugge'),
        makeStop(2, 's2', 'Gent', {
          deliveryProof: {
            method: 'QR',
            deliveredAt: new Date(),
            deliveredByUserId: courierUserId,
            associatedOrderIds: ['o'],
            recipientProfileId: 'p',
            recipientCity: 'Gent',
          },
        }),
        makeStop(3, 's3', 'Antwerpen'),
      ],
    })
    const { service } = buildService(route)

    const result = await service.recordDeliveryLocation({
      route,
      stop: route.stops[0],
      deliveredAt: new Date('2026-07-26T10:00:00.000Z'),
      courierUserId,
      courierBezorgerProfileId: bezorgerProfileId,
      confirmationEventId: 'c1',
      publishRouteUpdate: false,
    })

    expect(result.nextStop?.stopId).toBe('s3')
  })

  it('ADMIN and assigned BEZORGER see safe location; unrelated BEZORGER does not', () => {
    const route = makeRoute({
      lastKnownLocation: {
        stopId: 's1',
        stopSequence: 1,
        city: 'Brugge',
        recordedAt: new Date('2026-07-26T10:00:00.000Z'),
        source: RouteLocationSource.ARRIVAL,
        recordedByUserId: courierUserId,
        recordedByBezorgerProfileId: bezorgerProfileId,
        eventId: 'e1',
      },
    })
    const { service } = buildService(route)

    const admin = { role: UserRole.ADMIN, _id: new ObjectId() } as never
    const assigned = { role: UserRole.BEZORGER, _id: new ObjectId() } as never
    const other = { role: UserRole.BEZORGER, _id: new ObjectId() } as never

    expect(service.getSafeLocationForActor(route, admin)?.city).toBe('Brugge')
    expect(
      service.getSafeLocationForActor(route, assigned, {
        assignedBezorgerProfileId: bezorgerProfileId,
      })?.city,
    ).toBe('Brugge')
    expect(
      service.getSafeLocationForActor(route, other, {
        assignedBezorgerProfileId: 'other-profile',
      }),
    ).toBeNull()
  })

  it('pharmacist sees city only when their stop is the derived next stop', () => {
    const route = makeRoute({
      lastKnownLocation: {
        stopId: 's1',
        stopSequence: 1,
        city: 'Brugge',
        recordedAt: new Date('2026-07-26T10:00:00.000Z'),
        source: RouteLocationSource.DELIVERY,
        recordedByUserId: courierUserId,
        recordedByBezorgerProfileId: bezorgerProfileId,
        eventId: 'e1',
      },
    })
    const { service } = buildService(route)

    const next = service.getPharmacistLocationVisibility(route, route.stops[1])
    expect(next.isNextStop).toBe(true)
    expect(next.lastKnownCourierCity).toBe('Brugge')

    const earlier = service.getPharmacistLocationVisibility(
      route,
      route.stops[0],
    )
    expect(earlier.isNextStop).toBe(false)
    expect(earlier.lastKnownCourierCity).toBeNull()

    const later = service.getPharmacistLocationVisibility(route, route.stops[2])
    expect(later.isNextStop).toBe(false)
    expect(later.lastKnownCourierCity).toBeNull()
  })

  it('completed/cancelled routes expose no active pharmacy location', () => {
    const route = makeRoute({
      status: RouteStatus.COMPLETED,
      lastKnownLocation: {
        stopId: 's1',
        stopSequence: 1,
        city: 'Brugge',
        recordedAt: new Date('2026-07-26T10:00:00.000Z'),
        source: RouteLocationSource.DELIVERY,
        recordedByUserId: courierUserId,
        recordedByBezorgerProfileId: bezorgerProfileId,
        eventId: 'e1',
      },
    })
    const { service } = buildService(route)

    const visibility = service.getPharmacistLocationVisibility(
      route,
      route.stops[1],
    )
    expect(visibility.isNextStop).toBe(false)
    expect(visibility.lastKnownCourierCity).toBeNull()

    const status = service.buildSafeLocationStatus(route)
    expect(status.hasLocation).toBe(true)
    expect(status.city).toBe('Brugge')
    expect(status.hasNextStop).toBe(false)
  })

  it('recompute repairs missing location from stop events and is idempotent', async () => {
    const deliveredAt = new Date('2026-07-26T12:00:00.000Z')
    const route = makeRoute({
      stops: [
        makeStop(1, 's1', 'Brugge', {
          arrival: {
            clientArrivedAt: new Date('2026-07-26T11:00:00.000Z'),
            recordedAt: new Date('2026-07-26T11:00:00.000Z'),
            arrivedByUserId: courierUserId,
            arrivedByBezorgerProfileId: bezorgerProfileId,
            source: 'COURIER',
            idempotencyKey: 'arr-1',
          },
          deliveryProof: {
            method: 'QR',
            deliveredAt,
            deliveredByUserId: courierUserId,
            associatedOrderIds: ['order-s1'],
            recipientProfileId: 'profile-s1',
            recipientCity: 'Brugge',
            confirmationEventId: 'confirm-repair',
          },
        }),
        makeStop(2, 's2', 'Gent'),
      ],
      lastKnownLocation: null,
    })
    const { service, getRoute, auditRecord } = buildService(route)

    const first = await service.recomputeRouteLocation(routeId.toString())
    expect(first.applied).toBe(true)
    expect(getRoute()?.lastKnownLocation?.source).toBe(
      RouteLocationSource.DELIVERY,
    )
    expect(getRoute()?.lastKnownLocation?.city).toBe('Brugge')
    expect(first.nextStop?.stopId).toBe('s2')

    const second = await service.recomputeRouteLocation(routeId.toString())
    expect(second.applied).toBe(false)
    expect(auditRecord).toHaveBeenCalledTimes(1)
  })

  it('safe location status never includes eventId or coordinates', () => {
    const route = makeRoute({
      lastKnownLocation: {
        stopId: 's1',
        stopSequence: 1,
        city: 'Brugge',
        recordedAt: new Date('2026-07-26T10:00:00.000Z'),
        source: RouteLocationSource.ARRIVAL,
        recordedByUserId: courierUserId,
        recordedByBezorgerProfileId: bezorgerProfileId,
        eventId: 'secret-event',
      },
    })
    const { service } = buildService(route)
    const status = service.buildSafeLocationStatus(route)
    expect(JSON.stringify(status)).not.toContain('secret-event')
    expect(JSON.stringify(status)).not.toContain('latitude')
    expect(JSON.stringify(status)).not.toContain('longitude')
  })
})
