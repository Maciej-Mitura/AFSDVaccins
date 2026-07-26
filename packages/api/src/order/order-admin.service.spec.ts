import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { OrderNotificationService } from '../notifications/order-notification.service'
import { BusinessNotificationProducerService } from '../notifications/business-notification-producer.service'
import { StockService } from '../stock/stock.service'
import { SettingsService } from '../settings/settings.service'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { VaccineService } from '../vaccine/vaccine.service'
import { CLOCK } from './clock.provider'
import {
  InvalidOrderStatusTransitionException,
  OrderCannotBeCancelledException,
} from './exceptions/order.exceptions'
import { OrderEventsService } from './order-events.service'
import { OrderNormalizationService } from './order-normalization.service'
import { Order } from './order.entity'
import { OrderStatus } from './order-status.enum'
import { OrderService } from './order.service'

describe('OrderService admin lifecycle', () => {
  let service: OrderService
  let repository: jest.Mocked<
    Pick<MongoRepository<Order>, 'findOne' | 'find' | 'save' | 'updateOne'>
  >
  let stockService: jest.Mocked<Pick<StockService, 'applyDeliveryDecrement'>>
  let orderEventsService: jest.Mocked<
    Pick<
      OrderEventsService,
      'publishOrderStatusChanged' | 'publishOrderUpdated'
    >
  >
  let orderNotificationService: jest.Mocked<
    Pick<
      OrderNotificationService,
      'createOrderDeliveredNotification' | 'createAdminCancelledOrderNotification'
    >
  >
  let normalizationService: jest.Mocked<
    Pick<OrderNormalizationService, 'normalizeOrderIfNeeded' | 'normalizeOrdersIfNeeded'>
  >

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

  const orderId = '6a569d2cbb2590db980429cd'

  function baseOrder(status: OrderStatus): Order {
    return {
      _id: orderId,
      id: orderId,
      apothekerId: '507f1f77bcf86cd799439011',
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
      submittedAt: new Date('2026-07-14T10:00:00.000Z'),
      deliveryDate: '2026-07-15',
      cancelledAt: null,
      stockDecrementedAt: null,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedAt: new Date('2026-07-14T10:00:00.000Z'),
          changedByUserId: '507f1f77bcf86cd799439011',
        },
      ],
      createdAt: new Date('2026-07-14T10:00:00.000Z'),
      updatedAt: new Date('2026-07-14T10:00:00.000Z'),
    }
  }

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      updateOne: jest.fn(),
    }

    repository.save.mockImplementation(order => Promise.resolve(order as Order))

    stockService = {
      applyDeliveryDecrement: jest.fn(),
    }

    orderEventsService = {
      publishOrderStatusChanged: jest.fn(),
      publishOrderUpdated: jest.fn(),
    }

    orderNotificationService = {
      createOrderDeliveredNotification: jest.fn(),
      createAdminCancelledOrderNotification: jest.fn(),
    }

    normalizationService = {
      normalizeOrderIfNeeded: jest.fn((order: Order) => Promise.resolve(order)),
      normalizeOrdersIfNeeded: jest.fn((orders: Order[]) =>
        Promise.resolve(orders),
      ),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(Order), useValue: repository },
        { provide: VaccineService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: OrderEventsService, useValue: orderEventsService },
        { provide: OrderNotificationService, useValue: orderNotificationService },
        {
          provide: BusinessNotificationProducerService,
          useValue: { notifyAdminsNewOrder: jest.fn() },
        },
        { provide: OrderNormalizationService, useValue: normalizationService },
        { provide: StockService, useValue: stockService },
        {
          provide: CLOCK,
          useValue: { now: () => new Date('2026-07-15T08:00:00.000Z') },
        },
      ],
    }).compile()

    service = module.get(OrderService)
  })

  it('transitions PENDING to PLANNED without stock changes', async () => {
    const order = baseOrder(OrderStatus.PENDING)
    repository.findOne.mockResolvedValue(order)

    const result = await service.updateOrderStatus(
      admin,
      orderId,
      OrderStatus.PLANNED,
    )

    expect(result.status).toBe(OrderStatus.PLANNED)
    expect(stockService.applyDeliveryDecrement).not.toHaveBeenCalled()
    expect(result.statusHistory).toHaveLength(2)
    expect(orderEventsService.publishOrderStatusChanged).toHaveBeenCalled()
  })

  it('rejects invalid transitions', async () => {
    const order = baseOrder(OrderStatus.PLANNED)
    repository.findOne.mockResolvedValue(order)

    await expect(
      service.updateOrderStatus(admin, orderId, OrderStatus.CANCELLED),
    ).rejects.toBeInstanceOf(InvalidOrderStatusTransitionException)
  })

  it('delivers PLANNED orders with stock decrement', async () => {
    const order = baseOrder(OrderStatus.PLANNED)
    repository.findOne.mockResolvedValue(order)
    stockService.applyDeliveryDecrement.mockResolvedValue({
      alreadyProcessed: false,
      decrements: [],
    })

    const result = await service.updateOrderStatus(
      admin,
      orderId,
      OrderStatus.DELIVERED,
    )

    expect(stockService.applyDeliveryDecrement).toHaveBeenCalled()
    expect(result.status).toBe(OrderStatus.DELIVERED)
    expect(result.stockDecrementedAt).toEqual(new Date('2026-07-15T08:00:00.000Z'))
    expect(orderNotificationService.createOrderDeliveredNotification).toHaveBeenCalled()
  })

  it('is idempotent when already delivered', async () => {
    const order = baseOrder(OrderStatus.DELIVERED)
    order.stockDecrementedAt = new Date('2026-07-15T08:00:00.000Z')
    repository.findOne.mockResolvedValue(order)

    const result = await service.updateOrderStatus(
      admin,
      orderId,
      OrderStatus.DELIVERED,
    )

    expect(result).toBe(order)
    expect(stockService.applyDeliveryDecrement).not.toHaveBeenCalled()
    expect(orderEventsService.publishOrderStatusChanged).not.toHaveBeenCalled()
  })

  it('idempotent same-status PLANNED creates no duplicate history', async () => {
    const order = baseOrder(OrderStatus.PLANNED)
    order.statusHistory?.push({
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.PLANNED,
      changedAt: new Date('2026-07-14T11:00:00.000Z'),
      changedByUserId: admin._id.toString(),
    })
    repository.findOne.mockResolvedValue(order)

    const result = await service.updateOrderStatus(
      admin,
      orderId,
      OrderStatus.PLANNED,
    )

    expect(result.statusHistory?.length).toBe(2)
    expect(orderEventsService.publishOrderStatusChanged).not.toHaveBeenCalled()
  })

  it('planOrdersForGeneratedRoute transitions PENDING without publishing', async () => {
    const order = baseOrder(OrderStatus.PENDING)
    repository.findOne.mockResolvedValue(order)

    const changed = await service.planOrdersForGeneratedRoute(admin, [orderId])

    expect(changed).toHaveLength(1)
    expect(changed[0].status).toBe(OrderStatus.PLANNED)
    expect(changed[0].statusHistory?.at(-1)?.changedByUserId).toBe(
      admin._id.toString(),
    )
    expect(stockService.applyDeliveryDecrement).not.toHaveBeenCalled()
    expect(orderEventsService.publishOrderStatusChanged).not.toHaveBeenCalled()
  })

  it('planOrdersForGeneratedRoute skips already PLANNED orders', async () => {
    const order = baseOrder(OrderStatus.PLANNED)
    order.statusHistory?.push({
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.PLANNED,
      changedAt: new Date('2026-07-14T11:00:00.000Z'),
      changedByUserId: admin._id.toString(),
    })
    repository.findOne.mockResolvedValue(order)

    const changed = await service.planOrdersForGeneratedRoute(admin, [orderId])

    expect(changed).toHaveLength(0)
    expect(repository.save).not.toHaveBeenCalled()
    expect(orderEventsService.publishOrderStatusChanged).not.toHaveBeenCalled()
  })

  it('publishPlannedOrderUpdates emits deferred order events', async () => {
    const order = baseOrder(OrderStatus.PLANNED)

    await service.publishPlannedOrderUpdates([order])

    expect(orderEventsService.publishOrderStatusChanged).toHaveBeenCalledWith(
      order,
    )
  })

  it('findQualifyingOrdersForPharmacist excludes cancelled and delivered', async () => {
    const pending = baseOrder(OrderStatus.PENDING)
    const planned = {
      ...baseOrder(OrderStatus.PLANNED),
      _id: 'planned-id',
      id: 'planned-id',
    }
    const cancelled = {
      ...baseOrder(OrderStatus.CANCELLED),
      _id: 'cancelled-id',
      id: 'cancelled-id',
    }
    const delivered = {
      ...baseOrder(OrderStatus.DELIVERED),
      _id: 'delivered-id',
      id: 'delivered-id',
    }

    repository.find.mockResolvedValue([pending, planned, cancelled, delivered])
    normalizationService.normalizeOrdersIfNeeded.mockImplementation(orders =>
      Promise.resolve(orders),
    )

    const result = await service.findQualifyingOrdersForRoute({
      apothekerUserId: pending.apothekerId,
      deliveryDate: '2026-07-15',
    })

    expect(result.map(order => order.id)).toEqual([orderId, 'planned-id'])
  })

  it('findQualifyingOrdersForRoute queries ObjectId ownership form', async () => {
    const pending = baseOrder(OrderStatus.PENDING)
    repository.find.mockResolvedValue([pending])
    normalizationService.normalizeOrdersIfNeeded.mockImplementation(orders =>
      Promise.resolve(orders),
    )

    await service.findQualifyingOrdersForRoute({
      apothekerUserId: pending.apothekerId,
      deliveryDate: '2026-07-15',
    })

    expect(repository.find).toHaveBeenCalled()

    const firstCall = repository.find.mock.calls[0]?.[0] as {
      where?: { apothekerId?: unknown; deliveryDate?: string }
    }
    expect(firstCall.where?.deliveryDate).toBe('2026-07-15')
    expect(firstCall.where?.apothekerId).toBeInstanceOf(ObjectId)
    expect(String(firstCall.where?.apothekerId)).toBe(pending.apothekerId)
  })

  it('findQualifyingOrdersForRoute returns empty for malformed user ids', async () => {
    const result = await service.findQualifyingOrdersForRoute({
      apothekerUserId: 'not-an-id',
      deliveryDate: '2026-07-15',
    })

    expect(result).toEqual([])
    expect(repository.find).not.toHaveBeenCalled()
  })

  it('cancels eligible PENDING orders without stock changes', async () => {
    const order = baseOrder(OrderStatus.PENDING)
    repository.findOne.mockResolvedValue(order)

    const result = await service.cancelOrder(admin, orderId)

    expect(result.status).toBe(OrderStatus.CANCELLED)
    expect(stockService.applyDeliveryDecrement).not.toHaveBeenCalled()
    expect(
      orderNotificationService.createAdminCancelledOrderNotification,
    ).toHaveBeenCalled()
  })

  it('rejects cancellation of DELIVERED orders', async () => {
    const order = baseOrder(OrderStatus.DELIVERED)
    repository.findOne.mockResolvedValue(order)

    await expect(service.cancelOrder(admin, orderId)).rejects.toBeInstanceOf(
      OrderCannotBeCancelledException,
    )
  })

  it('aggregates daily overview excluding cancelled fulfilment totals', async () => {
    const active = baseOrder(OrderStatus.PENDING)
    const cancelled = {
      ...baseOrder(OrderStatus.CANCELLED),
      _id: 'cancelled-id',
      id: 'cancelled-id',
    }

    repository.find.mockResolvedValue([active, cancelled])

    const overview = await service.getAdminDailyOrderOverview('2026-07-15')

    expect(overview.totalOrders).toBe(1)
    expect(overview.totalDoses).toBe(5)
    expect(overview.cancelledOrderCount).toBe(1)
  })

  it('requires valid ObjectId for findOne', async () => {
    repository.findOne.mockResolvedValue(null)

    await expect(
      service.updateOrderStatus(admin, 'invalid-id', OrderStatus.PLANNED),
    ).rejects.toThrow()
  })
})
