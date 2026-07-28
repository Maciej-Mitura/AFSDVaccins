import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'

import { ApothekerProfileService } from '../../profile/apotheker/apotheker-profile.service'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { UserService } from '../../user/user.service'
import { Order } from '../order.entity'
import { OrderStatus } from '../order-status.enum'
import { encodeOrderHistoryCursor } from './order-history.cursor'
import {
  OrderHistoryInvalidCursorException,
  OrderHistoryInvalidFirstException,
  OrderHistoryInvalidRangeException,
} from './order-history.exceptions'
import { OrderHistoryService } from './order-history.service'

describe('OrderHistoryService', () => {
  let service: OrderHistoryService
  let createEntityCursor: jest.Mock
  let countDocuments: jest.Mock
  let findByUserId: jest.Mock
  let findUserById: jest.Mock

  const admin: User = {
    _id: '507f1f77bcf86cd799439012',
    id: '507f1f77bcf86cd799439012',
    firebaseUid: 'firebase-admin',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: UserRole.ADMIN,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const apotheker1: User = {
    ...admin,
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    firebaseUid: 'firebase-apotheker1',
    email: 'a1@example.com',
    firstName: 'Ann',
    lastName: 'Apotheker',
    role: UserRole.APOTHEKER,
  }

  const apotheker2Id = '507f1f77bcf86cd799439013'

  const idA = '6a569d2cbb2590db980429cd'
  const idB = '6a569d2cbb2590db980429ce'
  const idC = '6a569d2cbb2590db980429cf'

  function makeOrder(overrides: Partial<Order> & { _id: string }): Order {
    const submittedAt =
      overrides.submittedAt ?? new Date('2026-07-14T10:00:00.000Z')
    return {
      _id: overrides._id,
      id: overrides._id,
      apothekerId: overrides.apothekerId ?? apotheker1._id,
      status: overrides.status ?? OrderStatus.PENDING,
      orderLines: overrides.orderLines ?? [
        {
          vaccineId: '507f1f77bcf86cd799439021',
          vaccineName: 'Flu',
          manufacturer: 'Pharma',
          quantity: 2,
        },
      ],
      totalQuantity: overrides.totalQuantity ?? 2,
      isoWeek: 29,
      isoYear: 2026,
      submittedAt,
      deliveryDate: overrides.deliveryDate ?? '2026-07-15',
      cancelledAt: overrides.cancelledAt ?? null,
      deliveredAt: overrides.deliveredAt,
      deliveredByUserId: overrides.deliveredByUserId,
      deliveryMethod: overrides.deliveryMethod,
      statusHistory: overrides.statusHistory ?? [],
      createdAt: submittedAt,
      updatedAt: submittedAt,
    }
  }

  function mockCursor(orders: Order[]) {
    return {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn().mockResolvedValue(orders),
    }
  }

  beforeEach(async () => {
    createEntityCursor = jest.fn()
    countDocuments = jest.fn().mockResolvedValue(0)
    findByUserId = jest.fn().mockResolvedValue({
      pharmacyName: 'Apotheek Centrum',
      address: {
        street: 'Main',
        houseNumber: '1',
        postalCode: '1000',
        city: 'Brussels',
        country: 'BE',
      },
    })
    findUserById = jest.fn().mockResolvedValue({
      firstName: 'Ben',
      lastName: 'Bezorger',
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderHistoryService,
        {
          provide: getRepositoryToken(Order),
          useValue: {
            createEntityCursor,
            countDocuments,
          },
        },
        {
          provide: UserService,
          useValue: { findUserById },
        },
        {
          provide: ApothekerProfileService,
          useValue: { findByUserId },
        },
      ],
    }).compile()

    service = module.get(OrderHistoryService)
  })

  it('ADMIN sees orders across pharmacies', async () => {
    const orders = [
      makeOrder({ _id: idA, apothekerId: apotheker1._id }),
      makeOrder({
        _id: idB,
        apothekerId: apotheker2Id,
        submittedAt: new Date('2026-07-13T10:00:00.000Z'),
      }),
    ]
    countDocuments.mockResolvedValue(2)
    createEntityCursor.mockReturnValue(mockCursor(orders))

    const result = await service.findOrderHistory(admin, { first: 25 })

    expect(result.totalCount).toBe(2)
    expect(result.edges).toHaveLength(2)
    expect(result.edges.map(e => e.node.pharmacy?.apothekerUserId)).toEqual([
      apotheker1._id,
      apotheker2Id,
    ])
    expect(createEntityCursor).toHaveBeenCalledWith({})
  })

  it('ADMIN can filter by apothekerId', async () => {
    countDocuments.mockResolvedValue(1)
    createEntityCursor.mockReturnValue(
      mockCursor([makeOrder({ _id: idA, apothekerId: apotheker1._id })]),
    )

    await service.findOrderHistory(admin, {
      first: 10,
      apothekerId: apotheker1._id,
    })

    expect(createEntityCursor).toHaveBeenCalledWith({
      $or: [
        { apothekerId: new ObjectId(apotheker1._id) },
        { apothekerId: apotheker1._id },
      ],
    })
  })

  it('APOTHEKER sees only own orders', async () => {
    countDocuments.mockResolvedValue(1)
    createEntityCursor.mockReturnValue(
      mockCursor([makeOrder({ _id: idA, apothekerId: apotheker1._id })]),
    )

    await service.findOrderHistory(apotheker1, { first: 10 })

    expect(createEntityCursor).toHaveBeenCalledWith({
      $or: [
        { apothekerId: new ObjectId(apotheker1._id) },
        { apothekerId: apotheker1._id },
      ],
    })
  })

  it('APOTHEKER cannot expand scope with foreign apothekerId', async () => {
    countDocuments.mockResolvedValue(0)
    createEntityCursor.mockReturnValue(mockCursor([]))

    await service.findOrderHistory(apotheker1, {
      first: 10,
      apothekerId: apotheker2Id,
    })

    expect(createEntityCursor).toHaveBeenCalledWith({
      $or: [
        { apothekerId: new ObjectId(apotheker1._id) },
        { apothekerId: apotheker1._id },
      ],
    })
  })

  it('filters by status', async () => {
    countDocuments.mockResolvedValue(0)
    createEntityCursor.mockReturnValue(mockCursor([]))

    await service.findOrderHistory(admin, {
      first: 10,
      status: OrderStatus.DELIVERED,
    })

    expect(createEntityCursor).toHaveBeenCalledWith({
      status: OrderStatus.DELIVERED,
    })
  })

  it('filters by delivery date range', async () => {
    countDocuments.mockResolvedValue(0)
    createEntityCursor.mockReturnValue(mockCursor([]))

    await service.findOrderHistory(admin, {
      first: 10,
      deliveryDateFrom: '2026-07-10',
      deliveryDateTo: '2026-07-20',
    })

    expect(createEntityCursor).toHaveBeenCalledWith({
      deliveryDate: { $gte: '2026-07-10', $lte: '2026-07-20' },
    })
  })

  it('filters by submitted date range', async () => {
    countDocuments.mockResolvedValue(0)
    createEntityCursor.mockReturnValue(mockCursor([]))

    const from = new Date('2026-07-01T00:00:00.000Z')
    const to = new Date('2026-07-31T23:59:59.000Z')

    await service.findOrderHistory(admin, {
      first: 10,
      submittedFrom: from,
      submittedTo: to,
    })

    expect(createEntityCursor).toHaveBeenCalledWith({
      submittedAt: { $gte: from, $lte: to },
    })
  })

  it('searches by exact order id', async () => {
    countDocuments.mockResolvedValue(1)
    createEntityCursor.mockReturnValue(mockCursor([makeOrder({ _id: idA })]))

    await service.findOrderHistory(admin, { first: 10, search: idA })

    expect(createEntityCursor).toHaveBeenCalledWith({
      _id: new ObjectId(idA),
    })
  })

  it('rejects inverted delivery date range', async () => {
    await expect(
      service.findOrderHistory(admin, {
        first: 10,
        deliveryDateFrom: '2026-07-20',
        deliveryDateTo: '2026-07-10',
      }),
    ).rejects.toBeInstanceOf(OrderHistoryInvalidRangeException)
  })

  it('rejects inverted submitted range', async () => {
    await expect(
      service.findOrderHistory(admin, {
        first: 10,
        submittedFrom: new Date('2026-07-20T00:00:00.000Z'),
        submittedTo: new Date('2026-07-10T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(OrderHistoryInvalidRangeException)
  })

  it('enforces first maximum', async () => {
    await expect(
      service.findOrderHistory(admin, { first: 51 }),
    ).rejects.toBeInstanceOf(OrderHistoryInvalidFirstException)
  })

  it('rejects non-positive first', async () => {
    await expect(
      service.findOrderHistory(admin, { first: 0 }),
    ).rejects.toBeInstanceOf(OrderHistoryInvalidFirstException)
  })

  it('paginates with stable cursors newest-first', async () => {
    const t1 = new Date('2026-07-14T12:00:00.000Z')
    const t2 = new Date('2026-07-14T11:00:00.000Z')
    const t3 = new Date('2026-07-14T10:00:00.000Z')

    const page1 = [
      makeOrder({ _id: idA, submittedAt: t1 }),
      makeOrder({ _id: idB, submittedAt: t2 }),
    ]
    const page2 = [makeOrder({ _id: idC, submittedAt: t3 })]

    countDocuments.mockResolvedValue(3)
    createEntityCursor
      .mockReturnValueOnce(mockCursor([...page1, page2[0]]))
      .mockReturnValueOnce(mockCursor(page2))

    const firstPage = await service.findOrderHistory(admin, { first: 2 })
    expect(firstPage.edges).toHaveLength(2)
    expect(firstPage.pageInfo.hasNextPage).toBe(true)
    expect(firstPage.edges[0].node.id).toBe(idA)
    expect(firstPage.edges[1].node.id).toBe(idB)

    const after = firstPage.pageInfo.endCursor!
    const secondPage = await service.findOrderHistory(admin, {
      first: 2,
      after,
    })

    expect(secondPage.edges).toHaveLength(1)
    expect(secondPage.pageInfo.hasNextPage).toBe(false)
    expect(secondPage.edges[0].node.id).toBe(idC)

    const decoded = encodeOrderHistoryCursor(t2, idB)
    expect(after).toBe(decoded)

    const secondCallArgs = createEntityCursor.mock.calls[1] as [
      { $or?: unknown; $and?: unknown },
    ]
    const secondCallFilter = secondCallArgs[0]
    expect(secondCallFilter.$or ?? secondCallFilter.$and).toBeDefined()
  })

  it('rejects invalid cursor', async () => {
    await expect(
      service.findOrderHistory(admin, { first: 10, after: 'bad' }),
    ).rejects.toBeInstanceOf(OrderHistoryInvalidCursorException)
  })

  it('returns cancelledAt and nullable cancellationReason', async () => {
    const cancelledAt = new Date('2026-07-14T11:00:00.000Z')
    countDocuments.mockResolvedValue(1)
    createEntityCursor.mockReturnValue(
      mockCursor([
        makeOrder({
          _id: idA,
          status: OrderStatus.CANCELLED,
          cancelledAt,
          statusHistory: [
            {
              fromStatus: OrderStatus.PENDING,
              toStatus: OrderStatus.CANCELLED,
              changedAt: cancelledAt,
              changedByUserId: admin._id,
              reason: 'Stock issue',
            },
          ],
        }),
      ]),
    )

    const result = await service.findOrderHistory(admin, { first: 10 })
    expect(result.edges[0].node.cancelledAt).toEqual(cancelledAt)
    expect(result.edges[0].node.cancellationReason).toBe('Stock issue')
  })

  it('returns deliveredAt when persisted', async () => {
    const deliveredAt = new Date('2026-07-15T09:00:00.000Z')
    countDocuments.mockResolvedValue(1)
    createEntityCursor.mockReturnValue(
      mockCursor([
        makeOrder({
          _id: idA,
          status: OrderStatus.DELIVERED,
          deliveredAt,
          deliveredByUserId: '507f1f77bcf86cd799439099',
          deliveryMethod: 'QR',
        }),
      ]),
    )

    const result = await service.findOrderHistory(admin, { first: 10 })
    expect(result.edges[0].node.deliveredAt).toEqual(deliveredAt)
    expect(result.edges[0].node.deliveryMethod).toBe('QR')
    expect(result.edges[0].node.completedByDisplayName).toBe('Ben Bezorger')
  })

  it('returns null deliveredAt for legacy DELIVERED without field', async () => {
    countDocuments.mockResolvedValue(1)
    createEntityCursor.mockReturnValue(
      mockCursor([
        makeOrder({
          _id: idA,
          status: OrderStatus.DELIVERED,
          deliveredAt: null,
          updatedAt: new Date('2026-07-15T09:00:00.000Z'),
        }),
      ]),
    )

    const result = await service.findOrderHistory(admin, { first: 10 })
    expect(result.edges[0].node.deliveredAt).toBeNull()
    expect(result.edges[0].node.routeId).toBeNull()
  })

  it('returns null courier fields without crashing when lookup fails', async () => {
    findUserById.mockRejectedValue(new Error('missing'))
    findByUserId.mockResolvedValue(null)

    countDocuments.mockResolvedValue(1)
    createEntityCursor.mockReturnValue(
      mockCursor([
        makeOrder({
          _id: idA,
          status: OrderStatus.DELIVERED,
          deliveredAt: new Date('2026-07-15T09:00:00.000Z'),
          deliveredByUserId: '507f1f77bcf86cd799439099',
        }),
      ]),
    )

    const result = await service.findOrderHistory(admin, { first: 10 })
    expect(result.edges[0].node.completedByDisplayName).toBeNull()
    expect(result.edges[0].node.pharmacy?.pharmacyName).toBeNull()
  })

  it('invalid ObjectId apothekerId filter returns empty without 500', async () => {
    const result = await service.findOrderHistory(admin, {
      first: 10,
      apothekerId: 'not-an-object-id',
    })

    expect(result.edges).toEqual([])
    expect(result.totalCount).toBe(0)
    expect(createEntityCursor).not.toHaveBeenCalled()
  })

  it('non-hex search returns empty without querying', async () => {
    const result = await service.findOrderHistory(admin, {
      first: 10,
      search: 'pharmacy name',
    })

    expect(result.edges).toEqual([])
    expect(createEntityCursor).not.toHaveBeenCalled()
  })
})
