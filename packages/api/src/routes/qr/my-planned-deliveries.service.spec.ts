import { ObjectId } from 'mongodb'

import { OrderStatus } from '../../order/order-status.enum'
import { UserRole } from '../../user/user-role.enum'
import { User } from '../../user/user.entity'
import { DeliveryRoute } from '../delivery-route.entity'
import { RouteStatus } from '../route-status.enum'
import { DELIVERY_QR_TOKEN_VERSION } from './delivery-qr.constants'
import { DeliveryQrForbiddenException } from './delivery-stop-qr.exceptions'
import { MyPlannedDeliveriesService } from './my-planned-deliveries.service'

function apothekerUser(id: ObjectId = new ObjectId()): User {
  return {
    _id: id,
    role: UserRole.APOTHEKER,
  } as unknown as User
}

function adminUser(): User {
  return {
    _id: new ObjectId(),
    role: UserRole.ADMIN,
  } as unknown as User
}

function makeRoute(overrides?: {
  status?: RouteStatus
  ownerUserId?: string
  otherUserId?: string
  multiOrder?: boolean
  omitQr?: boolean
  omitStopId?: boolean
  consumed?: boolean
  deliveryDate?: string
}): DeliveryRoute {
  const ownerUserId = overrides?.ownerUserId ?? new ObjectId().toString()
  const otherUserId = overrides?.otherUserId ?? new ObjectId().toString()
  const orderIds = overrides?.multiOrder
    ? [new ObjectId().toString(), new ObjectId().toString()]
    : [new ObjectId().toString()]

  return {
    _id: new ObjectId(),
    deliveryDate: overrides?.deliveryDate ?? '2026-07-26',
    status: overrides?.status ?? RouteStatus.ASSIGNED,
    generatedAt: new Date('2026-07-25T10:00:00.000Z'),
    stops: [
      {
        stopId: overrides?.omitStopId ? undefined : 'stop-owner',
        sequence: 1,
        apothekerProfileId: new ObjectId().toString(),
        apothekerUserId: ownerUserId,
        pharmacyName: 'Owner Apotheek',
        address: {
          street: 'Kerkstraat',
          houseNumber: '1',
          postalCode: '8000',
          city: 'Brugge',
          country: 'BE',
        },
        orderIds,
        orderCount: orderIds.length,
        totalQuantity: 5,
        lines: [
          {
            vaccineId: 'v1',
            vaccineName: 'Flu',
            manufacturer: 'M',
            quantity: 5,
          },
        ],
        qrConfirmation: overrides?.omitQr
          ? undefined
          : {
              tokenVersion: DELIVERY_QR_TOKEN_VERSION,
              nonceHash: 'a'.repeat(64),
              encodedToken: 'payload.signature',
              issuedAt: new Date('2026-07-26T08:00:00.000Z'),
              consumedAt: overrides?.consumed
                ? new Date('2026-07-26T12:00:00.000Z')
                : null,
              consumedByUserId: overrides?.consumed
                ? new ObjectId().toString()
                : null,
            },
        deliveryProof: overrides?.consumed
          ? {
              method: 'QR',
              deliveredAt: new Date('2026-07-26T12:00:00.000Z'),
              deliveredByUserId: new ObjectId().toString(),
              associatedOrderIds: orderIds,
              recipientProfileId: new ObjectId().toString(),
              recipientCity: 'Brugge',
            }
          : undefined,
      },
      {
        stopId: 'stop-other',
        sequence: 2,
        apothekerProfileId: new ObjectId().toString(),
        apothekerUserId: otherUserId,
        pharmacyName: 'Other Apotheek',
        address: {
          street: 'Markt',
          houseNumber: '2',
          postalCode: '8000',
          city: 'Brugge',
          country: 'BE',
        },
        orderIds: [new ObjectId().toString()],
        orderCount: 1,
        totalQuantity: 2,
        lines: [],
        qrConfirmation: {
          tokenVersion: DELIVERY_QR_TOKEN_VERSION,
          nonceHash: 'b'.repeat(64),
          encodedToken: 'other.signature',
          issuedAt: new Date('2026-07-26T08:00:00.000Z'),
          consumedAt: null,
          consumedByUserId: null,
        },
      },
    ],
  } as unknown as DeliveryRoute
}

describe('MyPlannedDeliveriesService', () => {
  it('rejects non-APOTHEKER actors', async () => {
    const service = new MyPlannedDeliveriesService(
      { find: jest.fn() } as never,
      { findOne: jest.fn() } as never,
    )

    await expect(service.listForApotheker(adminUser())).rejects.toBeInstanceOf(
      DeliveryQrForbiddenException,
    )
  })

  it('returns only stops for the authenticated pharmacist', async () => {
    const ownerId = new ObjectId()
    const orderIdA = new ObjectId()
    const orderIdB = new ObjectId()
    const route = makeRoute({
      ownerUserId: ownerId.toString(),
      multiOrder: true,
    })
    route.stops[0].orderIds = [orderIdA.toString(), orderIdB.toString()]
    route.stops[0].orderCount = 2

    const routeRepo = {
      find: jest.fn().mockResolvedValue([route]),
    }
    const orderRepo = {
      findOne: jest.fn().mockImplementation(({ where }: { where: { _id: ObjectId } }) => {
        const id = where._id.toString()
        if (id === orderIdA.toString()) {
          return Promise.resolve({
            _id: orderIdA,
            status: OrderStatus.PLANNED,
            orderLines: [
              { vaccineId: 'v1', vaccineName: 'Flu', quantity: 3 },
            ],
          })
        }
        if (id === orderIdB.toString()) {
          return Promise.resolve({
            _id: orderIdB,
            status: OrderStatus.PLANNED,
            orderLines: [
              { vaccineId: 'v2', vaccineName: 'Covid', quantity: 2 },
            ],
          })
        }
        return Promise.resolve(null)
      }),
    }

    const service = new MyPlannedDeliveriesService(
      routeRepo as never,
      orderRepo as never,
    )

    const groups = await service.listForApotheker(apothekerUser(ownerId))
    const group = groups[0]

    expect(groups).toHaveLength(1)
    expect(group?.pharmacyName).toBe('Owner Apotheek')
    expect(group?.orderIds).toEqual([
      orderIdA.toString(),
      orderIdB.toString(),
    ])
    expect(group?.orders).toHaveLength(2)
    expect(group?.qrAvailable).toBe(true)
    expect(group?.qrImagePath).toContain('/delivery-routes/')
    expect(JSON.stringify(groups)).not.toContain('encodedToken')
    expect(JSON.stringify(groups)).not.toContain('nonceHash')
    expect(routeRepo.find).toHaveBeenCalled()
  })

  it('returns empty list for an unrelated pharmacist', async () => {
    const routeRepo = {
      find: jest.fn().mockResolvedValue([]),
    }

    const service = new MyPlannedDeliveriesService(
      routeRepo as never,
      { findOne: jest.fn() } as never,
    )

    const groups = await service.listForApotheker(apothekerUser())
    expect(groups).toEqual([])
  })

  it('marks consumed and legacy stops correctly', async () => {
    const ownerId = new ObjectId()
    const consumed = makeRoute({
      ownerUserId: ownerId.toString(),
      consumed: true,
      status: RouteStatus.IN_PROGRESS,
    })
    const legacy = makeRoute({
      ownerUserId: ownerId.toString(),
      omitQr: true,
      omitStopId: true,
      deliveryDate: '2026-07-25',
    })

    const routeRepo = {
      find: jest.fn().mockResolvedValue([consumed, legacy]),
    }
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue({
        _id: new ObjectId(),
        status: OrderStatus.PLANNED,
        orderLines: [],
      }),
    }

    const service = new MyPlannedDeliveriesService(
      routeRepo as never,
      orderRepo as never,
    )

    const groups = await service.listForApotheker(apothekerUser(ownerId))
    const consumedGroup = groups.find(g => g.qrConsumed)
    const legacyGroup = groups.find(g => g.stopId == null)

    expect(consumedGroup?.qrAvailable).toBe(false)
    expect(consumedGroup?.qrImagePath).toBeNull()
    expect(consumedGroup?.deliveredAt).toBeInstanceOf(Date)

    expect(legacyGroup?.qrAvailable).toBe(false)
    expect(legacyGroup?.qrImagePath).toBeNull()
  })

  it('excludes COMPLETED and CANCELLED routes via query filter', async () => {
    const ownerId = new ObjectId()
    const routeRepo = {
      find: jest.fn().mockResolvedValue([]),
    }

    const service = new MyPlannedDeliveriesService(
      routeRepo as never,
      { findOne: jest.fn() } as never,
    )

    await service.listForApotheker(apothekerUser(ownerId))

    expect(routeRepo.find).toHaveBeenCalledTimes(1)
    const [findArg] = routeRepo.find.mock.calls[0] as unknown as [
      {
        where: {
          status: { $in: RouteStatus[] }
          'stops.apothekerUserId': string
        }
      },
    ]
    expect(findArg.where.status.$in).toEqual([
      RouteStatus.ASSIGNED,
      RouteStatus.IN_PROGRESS,
    ])
    expect(findArg.where['stops.apothekerUserId']).toBe(ownerId.toString())
  })
})
