import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { OrderNotificationService } from '../notifications/order-notification.service'
import { BusinessNotificationProducerService } from '../notifications/business-notification-producer.service'
import { SettingsService } from '../settings/settings.service'
import { StockService } from '../stock/stock.service'
import { VaccineService } from '../vaccine/vaccine.service'
import { CLOCK } from './clock.provider'
import { OrderEventsService } from './order-events.service'
import { OrderNormalizationService } from './order-normalization.service'
import { Order } from './order.entity'
import { OrderStatus } from './order-status.enum'
import { OrderService } from './order.service'

type FindWhere = {
  apothekerId?: unknown
  deliveryDate?: string
}

function readFindWhere(
  call: unknown,
): FindWhere | undefined {
  if (
    typeof call === 'object' &&
    call !== null &&
    'where' in call &&
    typeof (call as { where?: unknown }).where === 'object'
  ) {
    return (call as { where: FindWhere }).where
  }

  return undefined
}

/**
 * Documents the Phase 12 ownership bridge and ObjectId storage mismatch:
 *
 * RouteTemplateStop.apothekerProfileId → ApothekerProfile._id
 * ApothekerProfile.userId (string) → Order.apothekerId (ObjectId in MongoDB)
 */
describe('OrderService findQualifyingOrdersForRoute', () => {
  let service: OrderService
  let repository: jest.Mocked<
    Pick<MongoRepository<Order>, 'findOne' | 'find' | 'save' | 'updateOne'>
  >
  let normalizationService: jest.Mocked<
    Pick<
      OrderNormalizationService,
      'normalizeOrderIfNeeded' | 'normalizeOrdersIfNeeded'
    >
  >

  const apothekerUserId = '6a56944c65558758d46c7255'
  const otherUserId = '6a5947e19e98b1c03459a3e7'
  const deliveryDate = '2026-07-17'

  function makeOrder(
    id: string,
    ownerId: string,
    status: OrderStatus,
    date = deliveryDate,
  ): Order {
    return {
      _id: id,
      id,
      apothekerId: ownerId,
      status,
      orderLines: [
        {
          vaccineId: '507f1f77bcf86cd799439021',
          vaccineName: 'Influenza',
          manufacturer: 'PharmaCo',
          quantity: 5,
        },
      ],
      totalQuantity: 5,
      isoWeek: 29,
      isoYear: 2026,
      submittedAt: new Date('2026-07-16T10:00:00.000Z'),
      deliveryDate: date,
      statusHistory: [],
      createdAt: new Date('2026-07-16T10:00:00.000Z'),
      updatedAt: new Date('2026-07-16T10:00:00.000Z'),
    }
  }

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      updateOne: jest.fn(),
    }

    normalizationService = {
      normalizeOrderIfNeeded: jest.fn(order => Promise.resolve(order)),
      normalizeOrdersIfNeeded: jest.fn(orders => Promise.resolve(orders)),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(Order), useValue: repository },
        { provide: VaccineService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        {
          provide: OrderEventsService,
          useValue: {
            publishOrderStatusChanged: jest.fn(),
            publishOrderUpdated: jest.fn(),
          },
        },
        {
          provide: OrderNotificationService,
          useValue: {},
        },
        {
          provide: BusinessNotificationProducerService,
          useValue: { notifyAdminsNewOrder: jest.fn() },
        },
        { provide: OrderNormalizationService, useValue: normalizationService },
        { provide: StockService, useValue: {} },
        { provide: CLOCK, useValue: { now: () => new Date() } },
      ],
    }).compile()

    service = module.get(OrderService)
  })

  it('finds a PENDING order through the profile userId bridge as ObjectId', async () => {
    const pending = makeOrder(
      '707f1f77bcf86cd799439031',
      apothekerUserId,
      OrderStatus.PENDING,
    )
    repository.find.mockResolvedValueOnce([pending]).mockResolvedValueOnce([])

    const result = await service.findQualifyingOrdersForRoute({
      apothekerUserId,
      deliveryDate,
    })

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe(OrderStatus.PENDING)

    const where = readFindWhere(repository.find.mock.calls[0]?.[0])
    expect(where?.apothekerId).toBeInstanceOf(ObjectId)
    expect(String(where?.apothekerId)).toBe(apothekerUserId)
  })

  it('finds a PLANNED order through the same bridge', async () => {
    const planned = makeOrder(
      '707f1f77bcf86cd799439032',
      apothekerUserId,
      OrderStatus.PLANNED,
    )
    repository.find.mockResolvedValueOnce([planned]).mockResolvedValueOnce([])

    const result = await service.findQualifyingOrdersForRoute({
      apothekerUserId,
      deliveryDate,
    })

    expect(result.map(order => order.id)).toEqual([planned.id])
  })

  it('excludes another pharmacist’s order', async () => {
    const other = makeOrder(
      '707f1f77bcf86cd799439033',
      otherUserId,
      OrderStatus.PENDING,
    )
    repository.find.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const result = await service.findQualifyingOrdersForRoute({
      apothekerUserId,
      deliveryDate,
    })

    expect(result).toEqual([])
    expect(other.apothekerId).not.toBe(apothekerUserId)
  })

  it('excludes another delivery date', async () => {
    repository.find.mockImplementation(options => {
      const where = readFindWhere(options)
      if (where?.deliveryDate === deliveryDate) {
        return Promise.resolve([
          makeOrder(
            '707f1f77bcf86cd799439034',
            apothekerUserId,
            OrderStatus.PENDING,
            deliveryDate,
          ),
        ])
      }

      return Promise.resolve([])
    })

    const result = await service.findQualifyingOrdersForRoute({
      apothekerUserId,
      deliveryDate: '2026-07-18',
    })

    expect(result).toEqual([])
  })

  it('excludes CANCELLED orders', async () => {
    repository.find
      .mockResolvedValueOnce([
        makeOrder(
          '707f1f77bcf86cd799439035',
          apothekerUserId,
          OrderStatus.CANCELLED,
        ),
      ])
      .mockResolvedValueOnce([])

    const result = await service.findQualifyingOrdersForRoute({
      apothekerUserId,
      deliveryDate,
    })

    expect(result).toEqual([])
  })

  it('excludes DELIVERED orders', async () => {
    repository.find
      .mockResolvedValueOnce([
        makeOrder(
          '707f1f77bcf86cd799439036',
          apothekerUserId,
          OrderStatus.DELIVERED,
        ),
      ])
      .mockResolvedValueOnce([])

    const result = await service.findQualifyingOrdersForRoute({
      apothekerUserId,
      deliveryDate,
    })

    expect(result).toEqual([])
  })

  it('accepts GraphQL/profile ownership ids as strings', async () => {
    const pending = makeOrder(
      '707f1f77bcf86cd799439037',
      apothekerUserId,
      OrderStatus.PENDING,
    )
    repository.find.mockResolvedValueOnce([pending]).mockResolvedValueOnce([])

    await service.findQualifyingOrdersForRoute({
      apothekerUserId: String(apothekerUserId),
      deliveryDate,
    })

    const where = readFindWhere(repository.find.mock.calls[0]?.[0])
    expect(where?.apothekerId).toBeInstanceOf(ObjectId)
  })

  it('also probes the string storage form for mixed historical data', async () => {
    const pending = makeOrder(
      '707f1f77bcf86cd799439038',
      apothekerUserId,
      OrderStatus.PENDING,
    )
    repository.find.mockResolvedValueOnce([]).mockResolvedValueOnce([pending])

    const result = await service.findQualifyingOrdersForRoute({
      apothekerUserId,
      deliveryDate,
    })

    expect(result).toHaveLength(1)
    const where = readFindWhere(repository.find.mock.calls[1]?.[0])
    expect(where?.apothekerId).toBe(apothekerUserId)
  })
})
