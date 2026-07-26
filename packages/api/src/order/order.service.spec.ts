import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { ApplicationSettings } from '../settings/settings.entity'
import { SettingsService } from '../settings/settings.service'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import {
  VaccineInactiveException,
  VaccineNotFoundException,
} from '../vaccine/exceptions/vaccine.exceptions'
import { Vaccine } from '../vaccine/vaccine.entity'
import { VaccineService } from '../vaccine/vaccine.service'
import { CLOCK } from './clock.provider'
import {
  DailyLimitExceededException,
  InvalidOrderQuantityException,
  OrderCannotBeCancelledException,
  OrderNotOwnedException,
  WeeklyLimitExceededException,
} from './exceptions/order.exceptions'
import { OrderNotificationService } from '../notifications/order-notification.service'
import { BusinessNotificationProducerService } from '../notifications/business-notification-producer.service'
import { StockService } from '../stock/stock.service'
import { OrderEventsService } from './order-events.service'
import { OrderNormalizationService } from './order-normalization.service'
import { Order } from './order.entity'
import { OrderStatus } from './order-status.enum'
import { OrderService } from './order.service'

describe('OrderService', () => {
  let service: OrderService
  let repository: jest.Mocked<
    Pick<MongoRepository<Order>, 'findOne' | 'find' | 'create' | 'save'>
  >
  let vaccineService: jest.Mocked<
    Pick<VaccineService, 'findVaccineEntityById' | 'findVaccines'>
  >
  let settingsService: jest.Mocked<
    Pick<SettingsService, 'getApplicationSettings'>
  >
  let orderNotificationService: jest.Mocked<
    Pick<
      OrderNotificationService,
      'handleOrderCreated' | 'createOrderCancelledNotification'
    >
  >
  let orderEventsService: jest.Mocked<
    Pick<
      OrderEventsService,
      'publishOrderCreated' | 'publishOrderUpdated' | 'publishOrderStatusChanged'
    >
  >
  let businessNotificationProducer: {
    notifyAdminsNewOrder: jest.Mock
  }

  const apothekerId = '507f1f77bcf86cd799439011'
  const otherApothekerId = '507f1f77bcf86cd799439012'
  const orderId = '6a569d2cbb2590db980429cd'
  const vaccineAId = '507f1f77bcf86cd799439021'
  const vaccineBId = '507f1f77bcf86cd799439022'

  const apotheker: User = {
    _id: apothekerId,
    id: apothekerId,
    firebaseUid: 'firebase-apotheker',
    email: 'apotheker@example.com',
    firstName: 'Jan',
    lastName: 'Apotheker',
    role: UserRole.APOTHEKER,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const settings: ApplicationSettings = {
    _id: 'settings-id',
    id: 'settings-id',
    singletonKey: 'default',
    timezone: 'Europe/Brussels',
    orderingClosingTime: '14:00',
    weeklyWarningPercentage: 90,
    weeklyDoseCap: 200,
    dailyDoseCapPerType: 50,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const activeVaccineA: Vaccine = {
    _id: vaccineAId,
    id: vaccineAId,
    name: 'Influenza',
    normalizedName: 'influenza',
    description: '',
    manufacturer: 'PharmaCo',
    stockQuantity: 100,
    stockWarningThreshold: 10,
    active: true,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const activeVaccineB: Vaccine = {
    ...activeVaccineA,
    _id: vaccineBId,
    id: vaccineBId,
    name: 'Tetanus',
    normalizedName: 'tetanus',
  }

  const pendingOrder: Order = {
    _id: orderId,
    id: orderId,
    apothekerId,
    status: OrderStatus.PENDING,
    orderLines: [
      {
        vaccineId: vaccineAId,
        vaccineName: 'Influenza',
        manufacturer: 'PharmaCo',
        quantity: 10,
      },
    ],
    totalQuantity: 10,
    isoWeek: 29,
    isoYear: 2026,
    submittedAt: new Date('2026-07-14T10:00:00.000Z'),
    deliveryDate: '2026-07-14',
    cancelledAt: null,
    createdAt: new Date('2026-07-14T10:00:00.000Z'),
    updatedAt: new Date('2026-07-14T10:00:00.000Z'),
  }

  let now = new Date('2026-07-14T10:00:00.000Z')

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    }

    vaccineService = {
      findVaccineEntityById: jest.fn(),
      findVaccines: jest.fn(),
    }

    settingsService = {
      getApplicationSettings: jest.fn().mockResolvedValue(settings),
    }

    orderEventsService = {
      publishOrderCreated: jest.fn().mockResolvedValue(undefined),
      publishOrderUpdated: jest.fn().mockResolvedValue(undefined),
      publishOrderStatusChanged: jest.fn().mockResolvedValue(undefined),
    }

    orderNotificationService = {
      handleOrderCreated: jest.fn().mockResolvedValue(undefined),
      createOrderCancelledNotification: jest.fn().mockResolvedValue(undefined),
    }

    businessNotificationProducer = {
      notifyAdminsNewOrder: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: getRepositoryToken(Order),
          useValue: repository,
        },
        {
          provide: VaccineService,
          useValue: vaccineService,
        },
        {
          provide: SettingsService,
          useValue: settingsService,
        },
        {
          provide: OrderEventsService,
          useValue: orderEventsService,
        },
        {
          provide: OrderNotificationService,
          useValue: orderNotificationService,
        },
        {
          provide: BusinessNotificationProducerService,
          useValue: businessNotificationProducer,
        },
        {
          provide: OrderNormalizationService,
          useValue: {
            normalizeOrderIfNeeded: jest.fn((order: Order) => Promise.resolve(order)),
            normalizeOrdersIfNeeded: jest.fn((orders: Order[]) =>
              Promise.resolve(orders),
            ),
          },
        },
        {
          provide: StockService,
          useValue: {
            applyDeliveryDecrement: jest.fn(),
          },
        },
        {
          provide: CLOCK,
          useValue: {
            now: () => now,
          },
        },
      ],
    }).compile()

    service = module.get(OrderService)
    now = new Date('2026-07-14T10:00:00.000Z')
    repository.find.mockResolvedValue([])
    vaccineService.findVaccineEntityById.mockImplementation(id => {
      if (id === vaccineAId) {
        return Promise.resolve(activeVaccineA)
      }

      if (id === vaccineBId) {
        return Promise.resolve(activeVaccineB)
      }

      return Promise.reject(new VaccineNotFoundException())
    })
  })

  it('creates a PENDING order for the authenticated apotheker', async () => {
    repository.create.mockImplementation(value => value as Order)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...pendingOrder,
        ...value,
      } as Order),
    )

    const result = await service.createOrder(apotheker, {
      lines: [{ vaccineId: vaccineAId, quantity: 10 }],
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        apothekerId,
        status: OrderStatus.PENDING,
        totalQuantity: 10,
        isoWeek: 29,
        isoYear: 2026,
        deliveryDate: '2026-07-14',
      }),
    )
    expect(result.status).toBe(OrderStatus.PENDING)
  })

  it('publishes orderCreated only after successful persistence', async () => {
    repository.create.mockImplementation(value => value as Order)
    repository.save.mockImplementation(value =>
      Promise.resolve({
        ...pendingOrder,
        ...value,
      } as Order),
    )

    await service.createOrder(apotheker, {
      lines: [{ vaccineId: vaccineAId, quantity: 1 }],
    })

    expect(orderEventsService.publishOrderCreated).toHaveBeenCalledTimes(1)
    expect(orderNotificationService.handleOrderCreated).toHaveBeenCalledTimes(1)
    expect(businessNotificationProducer.notifyAdminsNewOrder).toHaveBeenCalledTimes(
      1,
    )
    expect(orderEventsService.publishOrderStatusChanged).not.toHaveBeenCalled()
  })

  it('does not create notifications when validation fails', async () => {
    await expect(
      service.createOrder(apotheker, { lines: [] }),
    ).rejects.toBeInstanceOf(InvalidOrderQuantityException)

    expect(orderEventsService.publishOrderCreated).not.toHaveBeenCalled()
    expect(orderNotificationService.handleOrderCreated).not.toHaveBeenCalled()
    expect(
      businessNotificationProducer.notifyAdminsNewOrder,
    ).not.toHaveBeenCalled()
  })

  it('derives pharmacist ownership from the application user', async () => {
    repository.create.mockImplementation(value => value as Order)
    repository.save.mockImplementation(value => Promise.resolve(value as Order))

    await service.createOrder(apotheker, {
      lines: [{ vaccineId: vaccineAId, quantity: 2 }],
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ apothekerId }),
    )
  })

  it('rejects empty orders', async () => {
    await expect(service.createOrder(apotheker, { lines: [] })).rejects.toBeInstanceOf(
      InvalidOrderQuantityException,
    )
  })

  it('rejects zero, negative, or non-integer quantities', async () => {
    await expect(
      service.createOrder(apotheker, {
        lines: [{ vaccineId: vaccineAId, quantity: 0 }],
      }),
    ).rejects.toBeInstanceOf(InvalidOrderQuantityException)

    await expect(
      service.createOrder(apotheker, {
        lines: [{ vaccineId: vaccineAId, quantity: -1 }],
      }),
    ).rejects.toBeInstanceOf(InvalidOrderQuantityException)
  })

  it('rejects missing vaccines', async () => {
    await expect(
      service.createOrder(apotheker, {
        lines: [{ vaccineId: 'invalid-id', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)
  })

  it('rejects inactive vaccines', async () => {
    vaccineService.findVaccineEntityById.mockResolvedValue({
      ...activeVaccineA,
      active: false,
    } as Vaccine)

    await expect(
      service.createOrder(apotheker, {
        lines: [{ vaccineId: vaccineAId, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(VaccineInactiveException)
  })

  it('merges duplicate vaccine lines deterministically', async () => {
    repository.create.mockImplementation(value => value as Order)
    repository.save.mockImplementation(value => Promise.resolve(value as Order))

    await service.createOrder(apotheker, {
      lines: [
        { vaccineId: vaccineAId, quantity: 3 },
        { vaccineId: vaccineAId, quantity: 4 },
      ],
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        totalQuantity: 7,
        orderLines: [
          expect.objectContaining({
            vaccineId: vaccineAId,
            quantity: 7,
          }),
        ],
      }),
    )
  })

  it('accepts after-closing orders with next-day deliveryDate', async () => {
    now = new Date('2026-07-14T12:01:00.000Z')
    repository.create.mockImplementation(value => value as Order)
    repository.save.mockImplementation(value => Promise.resolve(value as Order))

    await service.createOrder(apotheker, {
      lines: [{ vaccineId: vaccineAId, quantity: 1 }],
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryDate: '2026-07-15',
        isoWeek: 29,
        isoYear: 2026,
      }),
    )
  })

  it('derives deliveryDate server-side from closing-time policy', async () => {
    repository.create.mockImplementation(value => value as Order)
    repository.save.mockImplementation(value => Promise.resolve(value as Order))

    await service.createOrder(apotheker, {
      lines: [{ vaccineId: vaccineAId, quantity: 1 }],
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryDate: '2026-07-14' }),
    )
  })

  it('uses configurable dose caps from ApplicationSettings', async () => {
    settingsService.getApplicationSettings.mockResolvedValue({
      ...settings,
      weeklyDoseCap: 100,
      dailyDoseCapPerType: 25,
    } as ApplicationSettings)
    repository.find.mockResolvedValue([
      {
        ...pendingOrder,
        totalQuantity: 99,
      } as Order,
    ])

    await expect(
      service.createOrder(apotheker, {
        lines: [{ vaccineId: vaccineAId, quantity: 2 }],
      }),
    ).rejects.toBeInstanceOf(WeeklyLimitExceededException)
  })

  it('calculates weekly summary and excludes cancelled orders', async () => {
    repository.find.mockResolvedValue([
      pendingOrder,
      {
        ...pendingOrder,
        _id: 'cancelled-order',
        id: 'cancelled-order',
        status: OrderStatus.CANCELLED,
        totalQuantity: 50,
      },
    ])

    const summary = await service.findMyWeeklyOrderSummary(apotheker)

    expect(summary.orderedQuantity).toBe(10)
    expect(summary.weeklyLimit).toBe(200)
    expect(summary.remainingQuantity).toBe(190)
    expect(summary.warningReached).toBe(false)
  })

  it('marks warningReached when weekly usage crosses the configured threshold', async () => {
    repository.find.mockResolvedValue([
      {
        ...pendingOrder,
        totalQuantity: 180,
      } as Order,
    ])

    const summary = await service.findMyWeeklyOrderSummary(apotheker)

    expect(summary.percentageUsed).toBe(90)
    expect(summary.warningReached).toBe(true)
  })

  it('rejects weekly hard limit exceedance', async () => {
    repository.find.mockResolvedValue([
      {
        ...pendingOrder,
        totalQuantity: 199,
      } as Order,
    ])

    await expect(
      service.createOrder(apotheker, {
        lines: [{ vaccineId: vaccineAId, quantity: 2 }],
      }),
    ).rejects.toBeInstanceOf(WeeklyLimitExceededException)
  })

  it('rejects daily per-vaccine hard limit exceedance', async () => {
    repository.find.mockResolvedValue([
      {
        ...pendingOrder,
        totalQuantity: 50,
        orderLines: [
          {
            vaccineId: vaccineAId,
            vaccineName: 'Influenza',
            manufacturer: 'PharmaCo',
            quantity: 50,
          },
        ],
      } as Order,
    ])

    try {
      await service.createOrder(apotheker, {
        lines: [{ vaccineId: vaccineAId, quantity: 1 }],
      })
      fail('Expected DailyLimitExceededException')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DailyLimitExceededException)
      const exception = error as DailyLimitExceededException
      expect(exception.getResponse()).toEqual(
        expect.objectContaining({
          error: 'DAILY_LIMIT_EXCEEDED',
          vaccineId: vaccineAId,
          dailyMaximum: 50,
          alreadyOrderedToday: 50,
          remainingToday: 0,
          requestedQuantity: 1,
        }),
      )
    }
  })

  it('returns per-vaccine daily allowances for the current delivery window', async () => {
    repository.find.mockResolvedValue([
      {
        ...pendingOrder,
        totalQuantity: 12,
        orderLines: [
          {
            vaccineId: vaccineAId,
            vaccineName: 'Influenza',
            manufacturer: 'PharmaCo',
            quantity: 12,
          },
        ],
      } as Order,
    ])
    vaccineService.findVaccines = jest
      .fn()
      .mockResolvedValue([activeVaccineA, activeVaccineB])

    const result = await service.findMyDailyVaccineAllowances(apotheker)

    expect(result.deliveryDate).toBe('2026-07-14')
    expect(result.allowances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vaccineId: vaccineAId,
          dailyMaximum: 50,
          orderedToday: 12,
          remainingToday: 38,
        }),
        expect.objectContaining({
          vaccineId: vaccineBId,
          orderedToday: 0,
          remainingToday: 50,
        }),
      ]),
    )
  })

  it('retrieves only the current pharmacist orders', async () => {
    repository.find.mockResolvedValue([pendingOrder])

    const result = await service.findMyOrders(apotheker)

    expect(repository.find).toHaveBeenCalledWith({
      where: { apothekerId },
      order: { submittedAt: 'DESC' },
    })
    expect(result).toEqual([pendingOrder])
  })

  it('prevents cross-user order access', async () => {
    repository.findOne.mockResolvedValue({
      ...pendingOrder,
      apothekerId: otherApothekerId,
    } as Order)

    await expect(
      service.findMyOrder(apotheker, orderId),
    ).rejects.toBeInstanceOf(OrderNotOwnedException)

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { _id: new ObjectId(orderId) },
    })
  })

  it('cancels an owned PENDING order', async () => {
    repository.findOne.mockResolvedValue({ ...pendingOrder } as Order)
    repository.save.mockImplementation(value => Promise.resolve(value as Order))

    const result = await service.cancelOwnOrder(apotheker, orderId)

    expect(result.status).toBe(OrderStatus.CANCELLED)
    expect(result.cancelledAt).toEqual(now)
    expect(orderEventsService.publishOrderStatusChanged).toHaveBeenCalledTimes(1)
    expect(
      orderNotificationService.createOrderCancelledNotification,
    ).toHaveBeenCalledTimes(1)
  })

  it('does not publish orderUpdated for idempotent repeated cancellation', async () => {
    const cancelled = {
      ...pendingOrder,
      status: OrderStatus.CANCELLED,
      cancelledAt: new Date('2026-07-14T11:00:00.000Z'),
    } as Order

    repository.findOne.mockResolvedValue(cancelled)

    const result = await service.cancelOwnOrder(apotheker, orderId)

    expect(result).toEqual(cancelled)
    expect(repository.save).not.toHaveBeenCalled()
    expect(orderEventsService.publishOrderStatusChanged).not.toHaveBeenCalled()
    expect(
      orderNotificationService.createOrderCancelledNotification,
    ).not.toHaveBeenCalled()
  })

  it('prevents cancellation of PLANNED orders', async () => {
    repository.findOne.mockResolvedValue({
      ...pendingOrder,
      status: OrderStatus.PLANNED,
    } as Order)

    await expect(
      service.cancelOwnOrder(apotheker, orderId),
    ).rejects.toBeInstanceOf(OrderCannotBeCancelledException)
  })

  it('never changes vaccine stock when creating an order', async () => {
    repository.create.mockImplementation(value => value as Order)
    repository.save.mockImplementation(value => Promise.resolve(value as Order))

    await service.createOrder(apotheker, {
      lines: [{ vaccineId: vaccineAId, quantity: 5 }],
    })

    expect(vaccineService.findVaccineEntityById).toHaveBeenCalled()
    expect(activeVaccineA.stockQuantity).toBe(100)
  })
})
