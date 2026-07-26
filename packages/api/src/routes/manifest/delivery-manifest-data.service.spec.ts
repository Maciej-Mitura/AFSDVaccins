import { ObjectId } from 'mongodb'

import { OrderStatus } from '../../order/order-status.enum'
import { Order } from '../../order/order.entity'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { DeliveryRoute } from '../delivery-route.entity'
import { RouteStatus } from '../route-status.enum'
import { DELIVERY_QR_TOKEN_VERSION } from '../qr/delivery-qr.constants'
import { DeliveryProofMethod } from '../qr/delivery-proof-method.enum'
import {
  assertManifestDtoHasNoSecrets,
  DeliveryManifestDataService,
} from './delivery-manifest-data.service'
import {
  DeliveryManifestForbiddenException,
  DeliveryManifestOrderIntegrityException,
  DeliveryManifestRouteNotFoundException,
  DeliveryManifestStopNotFoundException,
} from './delivery-manifest.exceptions'

const FIXED_NOW = new Date('2026-07-26T12:00:00.000Z')
const TOKEN_A = 'hdr.payload.signature-a'
const TOKEN_B = 'hdr.payload.signature-b'

function adminUser(): User {
  return { _id: new ObjectId(), role: UserRole.ADMIN } as unknown as User
}

function bezorgerUser(id: ObjectId = new ObjectId()): User {
  return { _id: id, role: UserRole.BEZORGER } as unknown as User
}

function apothekerUser(id: ObjectId = new ObjectId()): User {
  return { _id: id, role: UserRole.APOTHEKER } as unknown as User
}

function makeOrder(overrides?: {
  id?: ObjectId
  lines?: { vaccineId: string; vaccineName: string; quantity: number }[]
  status?: OrderStatus
}): Order {
  const id = overrides?.id ?? new ObjectId()
  const lines = overrides?.lines ?? [
    {
      vaccineId: new ObjectId().toString(),
      vaccineName: 'Comirnaty',
      quantity: 10,
    },
  ]
  return {
    _id: id,
    get id() {
      return id.toString()
    },
    status: overrides?.status ?? OrderStatus.PLANNED,
    orderLines: lines,
    deliveryDate: '2026-07-26',
    totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
  } as unknown as Order
}

function makeRoute(options?: {
  status?: RouteStatus
  bezorgerProfileId?: ObjectId
  stops?: DeliveryRoute['stops']
  routeId?: ObjectId
}): DeliveryRoute {
  const routeId = options?.routeId ?? new ObjectId()
  const bezorgerProfileId = options?.bezorgerProfileId ?? new ObjectId()
  return {
    _id: routeId,
    get id() {
      return routeId.toString()
    },
    bezorgerProfileId: bezorgerProfileId.toString(),
    deliveryDate: '2026-07-26',
    status: options?.status ?? RouteStatus.ASSIGNED,
    stops: options?.stops ?? [],
    generatedAt: new Date('2026-07-25T10:00:00.000Z'),
    generatedByUserId: new ObjectId().toString(),
  } as unknown as DeliveryRoute
}

function makeStop(options: {
  stopId?: string
  sequence: number
  apothekerUserId: string
  pharmacyName: string
  city?: string
  orderIds: string[]
  encodedToken?: string | null
  omitQr?: boolean
  consumed?: boolean
  arrival?: boolean
  deliveryProof?: boolean
  courierUserId?: string
}): DeliveryRoute['stops'][number] {
  const courierUserId = options.courierUserId ?? new ObjectId().toString()
  return {
    stopId: options.stopId,
    sequence: options.sequence,
    apothekerProfileId: new ObjectId().toString(),
    apothekerUserId: options.apothekerUserId,
    pharmacyName: options.pharmacyName,
    address: {
      street: 'Kerkstraat',
      houseNumber: String(options.sequence),
      postalCode: '8000',
      city: options.city ?? 'Brugge',
      country: 'BE',
    },
    orderIds: options.orderIds,
    orderCount: options.orderIds.length,
    totalQuantity: 10,
    lines: [],
    qrConfirmation: options.omitQr
      ? undefined
      : {
          tokenVersion: DELIVERY_QR_TOKEN_VERSION,
          nonceHash: 'a'.repeat(64),
          encodedToken: options.consumed
            ? null
            : (options.encodedToken ?? TOKEN_A),
          issuedAt: new Date('2026-07-26T08:00:00.000Z'),
          consumedAt: options.consumed
            ? new Date('2026-07-26T11:00:00.000Z')
            : null,
          consumedByUserId: options.consumed ? courierUserId : null,
        },
    arrival: options.arrival
      ? {
          clientArrivedAt: new Date('2026-07-26T10:30:00.000Z'),
          recordedAt: new Date('2026-07-26T10:31:00.000Z'),
          arrivedByUserId: courierUserId,
          arrivedByBezorgerProfileId: new ObjectId().toString(),
          source: 'COURIER',
          idempotencyKey: 'idem-1',
        }
      : undefined,
    deliveryProof: options.deliveryProof
      ? {
          method: DeliveryProofMethod.QR,
          deliveredAt: new Date('2026-07-26T11:00:00.000Z'),
          deliveredByUserId: courierUserId,
          associatedOrderIds: options.orderIds,
          recipientProfileId: new ObjectId().toString(),
          recipientCity: options.city ?? 'Brugge',
          confirmationEventId: 'evt-' + 'b'.repeat(20),
        }
      : undefined,
  } as unknown as DeliveryRoute['stops'][number]
}

describe('DeliveryManifestDataService', () => {
  const routeRepo = {
    findOne: jest.fn(),
  }
  const orderRepo = {
    findOne: jest.fn(),
  }
  const bezorgerProfileService = {
    findByUserId: jest.fn(),
    findBezorgerProfileById: jest.fn(),
  }
  const qrImageService = {
    renderPngBuffer: jest.fn(),
  }
  const clock = { now: () => FIXED_NOW }

  let service: DeliveryManifestDataService

  beforeEach(() => {
    jest.clearAllMocks()
    qrImageService.renderPngBuffer.mockResolvedValue(
      Buffer.from('fake-png-bytes'),
    )
    service = new DeliveryManifestDataService(
      routeRepo as never,
      orderRepo as never,
      bezorgerProfileService as never,
      qrImageService as never,
      clock,
    )
  })

  function stubOrders(orders: Order[]): void {
    orderRepo.findOne.mockImplementation(({ where }: { where: { _id: ObjectId } }) => {
      return Promise.resolve(
        orders.find(order => order._id.toString() === where._id.toString()) ??
          null,
      )
    })
  }

  function stubCourierProfile(profileId: ObjectId, userId: ObjectId, name = 'Courier One') {
    bezorgerProfileService.findBezorgerProfileById.mockResolvedValue({
      id: profileId.toString(),
      _id: profileId,
      userId: userId.toString(),
      displayName: name,
    })
    bezorgerProfileService.findByUserId.mockImplementation((uid: string) => {
      if (uid === userId.toString()) {
        return Promise.resolve({
          id: profileId.toString(),
          _id: profileId,
          userId: userId.toString(),
          displayName: name,
        })
      }
      return Promise.resolve(null)
    })
  }

  it('1: ADMIN may build full route manifest', async () => {
    const orderA = makeOrder()
    const orderB = makeOrder({
      lines: [
        {
          vaccineId: new ObjectId().toString(),
          vaccineName: 'Spikevax',
          quantity: 5,
        },
      ],
    })
    const pharmacyUser = new ObjectId().toString()
    const bezorgerProfileId = new ObjectId()
    const courierUserId = new ObjectId()
    const route = makeRoute({
      bezorgerProfileId,
      stops: [
        makeStop({
          stopId: 'stop-1',
          sequence: 2,
          apothekerUserId: pharmacyUser,
          pharmacyName: 'Apotheek Zuid',
          orderIds: [orderB._id.toString()],
          encodedToken: TOKEN_B,
        }),
        makeStop({
          stopId: 'stop-2',
          sequence: 1,
          apothekerUserId: pharmacyUser,
          pharmacyName: 'Apotheek Noord',
          orderIds: [orderA._id.toString()],
          encodedToken: TOKEN_A,
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([orderA, orderB])
    stubCourierProfile(bezorgerProfileId, courierUserId)

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )

    expect(manifest.scope).toBe('ROUTE')
    expect(manifest.stopCount).toBe(2)
    expect(manifest.totalOrderCount).toBe(2)
    expect(manifest.assignedCourier?.displayName).toBe('Courier One')
  })

  it('2: assigned BEZORGER may build full manifest', async () => {
    const courierUserId = new ObjectId()
    const profileId = new ObjectId()
    const order = makeOrder()
    const route = makeRoute({
      bezorgerProfileId: profileId,
      stops: [
        makeStop({
          stopId: 'stop-1',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'Apotheek A',
          orderIds: [order._id.toString()],
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([order])
    stubCourierProfile(profileId, courierUserId)

    const manifest = await service.buildRouteManifest(
      bezorgerUser(courierUserId),
      route._id.toString(),
    )
    expect(manifest.scope).toBe('ROUTE')
    expect(manifest.stops).toHaveLength(1)
  })

  it('3: unrelated BEZORGER rejected', async () => {
    const profileId = new ObjectId()
    const route = makeRoute({ bezorgerProfileId: profileId, stops: [] })
    routeRepo.findOne.mockResolvedValue(route)
    bezorgerProfileService.findByUserId.mockResolvedValue({
      id: new ObjectId().toString(),
      displayName: 'Other',
    })

    await expect(
      service.buildRouteManifest(bezorgerUser(), route._id.toString()),
    ).rejects.toBeInstanceOf(DeliveryManifestForbiddenException)
  })

  it('4: APOTHEKER rejected from full route manifest', async () => {
    const route = makeRoute({ stops: [] })
    routeRepo.findOne.mockResolvedValue(route)

    await expect(
      service.buildRouteManifest(apothekerUser(), route._id.toString()),
    ).rejects.toBeInstanceOf(DeliveryManifestForbiddenException)
  })

  it('5: owning APOTHEKER may build own stop manifest', async () => {
    const pharmacyUserId = new ObjectId()
    const order = makeOrder()
    const profileId = new ObjectId()
    const route = makeRoute({
      bezorgerProfileId: profileId,
      stops: [
        makeStop({
          stopId: 'stop-own',
          sequence: 1,
          apothekerUserId: pharmacyUserId.toString(),
          pharmacyName: 'My Pharmacy',
          orderIds: [order._id.toString()],
        }),
        makeStop({
          stopId: 'stop-other',
          sequence: 2,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'Other Pharmacy',
          orderIds: [new ObjectId().toString()],
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([order])
    stubCourierProfile(profileId, new ObjectId())

    const manifest = await service.buildStopManifest(
      apothekerUser(pharmacyUserId),
      route._id.toString(),
      'stop-own',
    )

    expect(manifest.scope).toBe('STOP')
    expect(manifest.stops).toHaveLength(1)
    expect(manifest.stops[0]?.pharmacy.name).toBe('My Pharmacy')
    expect(manifest.assignedCourier).toBeNull()
  })

  it('6: unrelated APOTHEKER rejected', async () => {
    const order = makeOrder()
    const route = makeRoute({
      stops: [
        makeStop({
          stopId: 'stop-own',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'Owned',
          orderIds: [order._id.toString()],
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)

    await expect(
      service.buildStopManifest(
        apothekerUser(),
        route._id.toString(),
        'stop-own',
      ),
    ).rejects.toBeInstanceOf(DeliveryManifestForbiddenException)
  })

  it('7: pharmacist stop manifest excludes other stops', async () => {
    const pharmacyUserId = new ObjectId()
    const order = makeOrder()
    const profileId = new ObjectId()
    const route = makeRoute({
      bezorgerProfileId: profileId,
      stops: [
        makeStop({
          stopId: 'stop-a',
          sequence: 1,
          apothekerUserId: pharmacyUserId.toString(),
          pharmacyName: 'Mine',
          city: 'Gent',
          orderIds: [order._id.toString()],
        }),
        makeStop({
          stopId: 'stop-b',
          sequence: 2,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'Secret Pharmacy',
          city: 'Antwerpen',
          orderIds: [new ObjectId().toString()],
          encodedToken: TOKEN_B,
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([order])
    stubCourierProfile(profileId, new ObjectId())

    const manifest = await service.buildStopManifest(
      apothekerUser(pharmacyUserId),
      route._id.toString(),
      'stop-a',
    )

    const serialised = JSON.stringify(manifest)
    expect(serialised).not.toContain('Secret Pharmacy')
    expect(serialised).not.toContain('Antwerpen')
    expect(manifest.stopCount).toBe(1)
    expect(manifest.totalOrderCount).toBe(1)
  })

  it('8: stop orders come only from stop.orderIds', async () => {
    const included = makeOrder()
    const excluded = makeOrder({
      lines: [
        {
          vaccineId: new ObjectId().toString(),
          vaccineName: 'ShouldNotAppear',
          quantity: 99,
        },
      ],
    })
    const route = makeRoute({
      stops: [
        makeStop({
          stopId: 'stop-1',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'A',
          orderIds: [included._id.toString()],
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([included, excluded])
    stubCourierProfile(new ObjectId(route.bezorgerProfileId), new ObjectId())

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(manifest.stops[0]?.orders).toHaveLength(1)
    expect(manifest.stops[0]?.orders[0]?.orderId).toBe(included._id.toString())
    expect(JSON.stringify(manifest)).not.toContain('ShouldNotAppear')
  })

  it('9: missing associated order fails whole manifest', async () => {
    const route = makeRoute({
      stops: [
        makeStop({
          stopId: 'stop-1',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'A',
          orderIds: [new ObjectId().toString()],
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    orderRepo.findOne.mockResolvedValue(null)
    stubCourierProfile(new ObjectId(route.bezorgerProfileId), new ObjectId())

    await expect(
      service.buildRouteManifest(adminUser(), route._id.toString()),
    ).rejects.toBeInstanceOf(DeliveryManifestOrderIntegrityException)
  })

  it('10: stop sequence sorted ascending', async () => {
    const o1 = makeOrder()
    const o2 = makeOrder()
    const o3 = makeOrder()
    const pharmacy = new ObjectId().toString()
    const route = makeRoute({
      stops: [
        makeStop({
          stopId: 's3',
          sequence: 3,
          apothekerUserId: pharmacy,
          pharmacyName: 'C',
          orderIds: [o3._id.toString()],
        }),
        makeStop({
          stopId: 's1',
          sequence: 1,
          apothekerUserId: pharmacy,
          pharmacyName: 'A',
          orderIds: [o1._id.toString()],
        }),
        makeStop({
          stopId: 's2',
          sequence: 2,
          apothekerUserId: pharmacy,
          pharmacyName: 'B',
          orderIds: [o2._id.toString()],
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([o1, o2, o3])
    stubCourierProfile(new ObjectId(route.bezorgerProfileId), new ObjectId())

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(manifest.stops.map(s => s.sequence)).toEqual([1, 2, 3])
  })

  it('11: multi-order stop includes all orders', async () => {
    const o1 = makeOrder()
    const o2 = makeOrder({
      lines: [
        {
          vaccineId: new ObjectId().toString(),
          vaccineName: 'Nuvaxovid',
          quantity: 3,
        },
      ],
    })
    const route = makeRoute({
      stops: [
        makeStop({
          stopId: 'stop-1',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'Multi',
          orderIds: [o1._id.toString(), o2._id.toString()],
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([o1, o2])
    stubCourierProfile(new ObjectId(route.bezorgerProfileId), new ObjectId())

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(manifest.stops[0]?.orders).toHaveLength(2)
    expect(manifest.totalOrderCount).toBe(2)
  })

  it('12: totals calculated correctly', async () => {
    const o1 = makeOrder({
      lines: [
        {
          vaccineId: new ObjectId().toString(),
          vaccineName: 'A',
          quantity: 4,
        },
        {
          vaccineId: new ObjectId().toString(),
          vaccineName: 'B',
          quantity: 6,
        },
      ],
    })
    const o2 = makeOrder({
      lines: [
        {
          vaccineId: new ObjectId().toString(),
          vaccineName: 'C',
          quantity: 5,
        },
      ],
    })
    const pharmacy = new ObjectId().toString()
    const route = makeRoute({
      stops: [
        makeStop({
          stopId: 's1',
          sequence: 1,
          apothekerUserId: pharmacy,
          pharmacyName: 'A',
          orderIds: [o1._id.toString()],
        }),
        makeStop({
          stopId: 's2',
          sequence: 2,
          apothekerUserId: pharmacy,
          pharmacyName: 'B',
          orderIds: [o2._id.toString()],
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([o1, o2])
    stubCourierProfile(new ObjectId(route.bezorgerProfileId), new ObjectId())

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(manifest.totalOrderCount).toBe(2)
    expect(manifest.totalLineCount).toBe(3)
    expect(manifest.totalItemQuantity).toBe(15)
    expect(manifest.stops[0]?.totals.itemQuantity).toBe(10)
  })

  it('13: active QR generated once per eligible stop', async () => {
    const o1 = makeOrder()
    const o2 = makeOrder()
    const pharmacy = new ObjectId().toString()
    const route = makeRoute({
      stops: [
        makeStop({
          stopId: 's1',
          sequence: 1,
          apothekerUserId: pharmacy,
          pharmacyName: 'A',
          orderIds: [o1._id.toString()],
          encodedToken: TOKEN_A,
        }),
        makeStop({
          stopId: 's2',
          sequence: 2,
          apothekerUserId: pharmacy,
          pharmacyName: 'B',
          orderIds: [o2._id.toString()],
          encodedToken: TOKEN_B,
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([o1, o2])
    stubCourierProfile(new ObjectId(route.bezorgerProfileId), new ObjectId())

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(qrImageService.renderPngBuffer).toHaveBeenCalledTimes(2)
    expect(qrImageService.renderPngBuffer).toHaveBeenCalledWith(
      TOKEN_A,
      expect.any(Object),
    )
    expect(qrImageService.renderPngBuffer).toHaveBeenCalledWith(
      TOKEN_B,
      expect.any(Object),
    )
    expect(manifest.stops.every(s => s.qr.state === 'ACTIVE')).toBe(true)
  })

  it('14: no QR token appears in manifest DTO output', async () => {
    const order = makeOrder()
    const route = makeRoute({
      stops: [
        makeStop({
          stopId: 's1',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'A',
          orderIds: [order._id.toString()],
          encodedToken: TOKEN_A,
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([order])
    stubCourierProfile(new ObjectId(route.bezorgerProfileId), new ObjectId())

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(() => assertManifestDtoHasNoSecrets(manifest)).not.toThrow()
    const serialised = JSON.stringify(manifest, (_k, v: unknown) =>
      Buffer.isBuffer(v) ? `[Buffer ${v.length}]` : v,
    )
    expect(serialised).not.toContain(TOKEN_A)
    expect(serialised).not.toContain('encodedToken')
    expect(serialised).not.toContain('nonceHash')
  })

  it('15: consumed stop omits active QR', async () => {
    const order = makeOrder()
    const courierUserId = new ObjectId().toString()
    const route = makeRoute({
      status: RouteStatus.IN_PROGRESS,
      stops: [
        makeStop({
          stopId: 's1',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'A',
          orderIds: [order._id.toString()],
          consumed: true,
          deliveryProof: true,
          courierUserId,
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([order])
    stubCourierProfile(new ObjectId(route.bezorgerProfileId), new ObjectId(courierUserId))

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(manifest.stops[0]?.qr.state).toBe('CONSUMED')
    expect(manifest.stops[0]?.qr.pngBytes).toBeNull()
    expect(qrImageService.renderPngBuffer).not.toHaveBeenCalled()
  })

  it('16: legacy stop reports unavailable QR', async () => {
    const order = makeOrder()
    const route = makeRoute({
      stops: [
        makeStop({
          stopId: 'legacy',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'Legacy',
          orderIds: [order._id.toString()],
          omitQr: true,
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([order])
    stubCourierProfile(new ObjectId(route.bezorgerProfileId), new ObjectId())

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(manifest.stops[0]?.qr.state).toBe('UNAVAILABLE')
    expect(manifest.stops[0]?.qr.pngBytes).toBeNull()
  })

  it('17: arrival data maps correctly', async () => {
    const order = makeOrder()
    const courierUserId = new ObjectId()
    const profileId = new ObjectId()
    const route = makeRoute({
      bezorgerProfileId: profileId,
      stops: [
        makeStop({
          stopId: 's1',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'A',
          orderIds: [order._id.toString()],
          arrival: true,
          courierUserId: courierUserId.toString(),
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([order])
    stubCourierProfile(profileId, courierUserId, 'Jan Courier')

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(manifest.stops[0]?.stopStatus).toBe('arrived')
    expect(manifest.stops[0]?.arrival?.clientArrivedAt.toISOString()).toBe(
      '2026-07-26T10:30:00.000Z',
    )
    expect(manifest.stops[0]?.arrival?.recordedAt.toISOString()).toBe(
      '2026-07-26T10:31:00.000Z',
    )
    expect(manifest.stops[0]?.arrival?.courierDisplayName).toBe('Jan Courier')
  })

  it('18: deliveryProof maps correctly', async () => {
    const order = makeOrder()
    const courierUserId = new ObjectId()
    const profileId = new ObjectId()
    const route = makeRoute({
      bezorgerProfileId: profileId,
      stops: [
        makeStop({
          stopId: 's1',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'A',
          city: 'Leuven',
          orderIds: [order._id.toString()],
          consumed: true,
          deliveryProof: true,
          courierUserId: courierUserId.toString(),
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([order])
    stubCourierProfile(profileId, courierUserId, 'Jan Courier')

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(manifest.stops[0]?.deliveryProof?.method).toBe('QR')
    expect(manifest.stops[0]?.deliveryProof?.recipientCity).toBe('Leuven')
    expect(manifest.stops[0]?.deliveryProof?.associatedOrderCount).toBe(1)
    expect(manifest.stops[0]?.deliveryProof?.courierDisplayName).toBe(
      'Jan Courier',
    )
  })

  it('19: pending stop shows no invented proof', async () => {
    const order = makeOrder()
    const route = makeRoute({
      stops: [
        makeStop({
          stopId: 's1',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'A',
          orderIds: [order._id.toString()],
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([order])
    stubCourierProfile(new ObjectId(route.bezorgerProfileId), new ObjectId())

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(manifest.stops[0]?.stopStatus).toBe('pending')
    expect(manifest.stops[0]?.arrival).toBeNull()
    expect(manifest.stops[0]?.deliveryProof).toBeNull()
  })

  it('20: cancelled route marked clearly', async () => {
    const order = makeOrder()
    const route = makeRoute({
      status: RouteStatus.CANCELLED,
      stops: [
        makeStop({
          stopId: 's1',
          sequence: 1,
          apothekerUserId: new ObjectId().toString(),
          pharmacyName: 'A',
          orderIds: [order._id.toString()],
          encodedToken: TOKEN_A,
        }),
      ],
    })
    routeRepo.findOne.mockResolvedValue(route)
    stubOrders([order])
    stubCourierProfile(new ObjectId(route.bezorgerProfileId), new ObjectId())

    const manifest = await service.buildRouteManifest(
      adminUser(),
      route._id.toString(),
    )
    expect(manifest.routeCancelled).toBe(true)
    expect(manifest.routeStatus).toBe(RouteStatus.CANCELLED)
    expect(manifest.stops[0]?.qr.state).toBe('OMITTED_CANCELLED')
    expect(qrImageService.renderPngBuffer).not.toHaveBeenCalled()
  })

  it('rejects invalid route id', async () => {
    await expect(
      service.buildRouteManifest(adminUser(), 'not-an-id'),
    ).rejects.toBeInstanceOf(DeliveryManifestRouteNotFoundException)
  })

  it('rejects missing stop id', async () => {
    const route = makeRoute({ stops: [] })
    routeRepo.findOne.mockResolvedValue(route)

    await expect(
      service.buildStopManifest(adminUser(), route._id.toString(), 'missing'),
    ).rejects.toBeInstanceOf(DeliveryManifestStopNotFoundException)
  })
})
