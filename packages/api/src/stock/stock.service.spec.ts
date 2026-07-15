import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { NotificationType } from '../notifications/notification-type.enum'
import { NotificationService } from '../notifications/notification.service'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { UserService } from '../user/user.service'
import { Vaccine } from '../vaccine/vaccine.entity'
import { StockAdjustmentType } from './stock-adjustment-type.enum'
import { StockAdjustment } from './stock-adjustment.entity'
import { StockAdjustmentRepository } from './stock-adjustment.repository'
import {
  InsufficientStockException,
  InvalidStockAdjustmentException,
  VaccineNotFoundException,
} from './exceptions/stock.exceptions'
import { StockNotificationService } from './stock-notification.service'
import { StockService } from './stock.service'
import { VaccineStockRepository } from './vaccine-stock.repository'

function createStockAdjustmentInstance(
  values: Partial<StockAdjustment>,
): StockAdjustment {
  const instance = Object.create(
    StockAdjustment.prototype,
  ) as StockAdjustment

  Object.assign(instance, values)

  return instance
}

describe('StockService', () => {
  let service: StockService
  let stockAdjustmentRepository: jest.Mocked<
    Pick<MongoRepository<StockAdjustment>, 'find'>
  >
  let stockAdjustmentWriter: jest.Mocked<
    Pick<
      StockAdjustmentRepository,
      'insertManualAdjustment' | 'insertIdempotentAdjustment' | 'findByIdempotencyKey'
    >
  >
  let vaccineStockRepository: jest.Mocked<
    Pick<
      VaccineStockRepository,
      'findVaccineByGraphqlId' | 'findVaccineByObjectId' | 'adjustStockQuantity'
    >
  >
  let stockNotificationService: jest.Mocked<
    Pick<StockNotificationService, 'notifyAdminsIfEnteredLowStock'>
  >

  const vaccineId = '507f1f77bcf86cd799439011'
  const nonexistentVaccineId = '6a569d2cbb2590db980429cd'
  const vaccineObjectId = new ObjectId(vaccineId)

  const adminUser: User = {
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

  const vaccine: Vaccine = {
    _id: vaccineId,
    id: vaccineId,
    name: 'Influenza',
    normalizedName: 'influenza',
    description: 'Seasonal flu vaccine',
    manufacturer: 'PharmaCo',
    stockQuantity: 10,
    stockWarningThreshold: 5,
    active: true,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  beforeEach(async () => {
    stockAdjustmentRepository = {
      find: jest.fn(),
    }

    stockAdjustmentWriter = {
      insertManualAdjustment: jest.fn(),
      insertIdempotentAdjustment: jest.fn(),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    }

    vaccineStockRepository = {
      findVaccineByGraphqlId: jest.fn(),
      findVaccineByObjectId: jest.fn(),
      adjustStockQuantity: jest.fn(),
    }

    stockNotificationService = {
      notifyAdminsIfEnteredLowStock: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        {
          provide: getRepositoryToken(StockAdjustment),
          useValue: stockAdjustmentRepository,
        },
        {
          provide: StockAdjustmentRepository,
          useValue: stockAdjustmentWriter,
        },
        {
          provide: VaccineStockRepository,
          useValue: vaccineStockRepository,
        },
        {
          provide: StockNotificationService,
          useValue: stockNotificationService,
        },
      ],
    }).compile()

    service = module.get(StockService)
  })

  function mockSuccessfulAdjustment(
    quantityBefore: number,
    quantityAfter: number,
    adjustmentId = '6a569d2cbb2590db980429cd',
  ): void {
    vaccineStockRepository.findVaccineByObjectId.mockResolvedValue(vaccine)
    vaccineStockRepository.adjustStockQuantity.mockResolvedValue({
      quantityBefore,
      quantityAfter,
    })
    stockAdjustmentWriter.insertManualAdjustment.mockImplementation(value =>
      Promise.resolve(
        createStockAdjustmentInstance({
          ...value,
          _id: adjustmentId,
          relatedOrderId: value.relatedOrderId ?? null,
          createdAt: new Date('2026-07-14T12:00:00.000Z'),
        }),
      ),
    )
  }

  it('accepts a valid GraphQL string ObjectId for adjustVaccineStock', async () => {
    mockSuccessfulAdjustment(10, 25)

    await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.RESTOCK,
      quantityDelta: 15,
      reason: 'Weekly delivery',
    })

    expect(vaccineStockRepository.findVaccineByObjectId).toHaveBeenCalledWith(
      vaccineObjectId,
    )
  })

  it('restock finds and updates the vaccine', async () => {
    mockSuccessfulAdjustment(10, 25)

    const result = await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.RESTOCK,
      quantityDelta: 15,
      reason: 'Weekly delivery',
    })

    expect(vaccineStockRepository.adjustStockQuantity).toHaveBeenCalledWith(
      vaccineObjectId,
      15,
    )
    expect(result.quantityBefore).toBe(10)
    expect(result.quantityAfter).toBe(25)
    expect(stockAdjustmentWriter.insertManualAdjustment).toHaveBeenCalledTimes(1)
    expect(stockAdjustmentWriter.insertManualAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        vaccineObjectId: vaccineObjectId,
        performedByUserId: adminUser._id.toString(),
      }),
    )
    expect(
      stockAdjustmentWriter.insertManualAdjustment.mock.calls[0]?.[0],
    ).not.toHaveProperty('idempotencyKey')
  })

  it('manual decrease finds the vaccine', async () => {
    mockSuccessfulAdjustment(10, 7)

    const result = await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.MANUAL_DECREASE,
      quantityDelta: -3,
      reason: 'Damaged doses',
    })

    expect(result.quantityAfter).toBe(7)
    expect(vaccineStockRepository.findVaccineByObjectId).toHaveBeenCalledWith(
      vaccineObjectId,
    )
  })

  it('finds stock history by GraphQL string vaccine ID using ObjectId lookup', async () => {
    vaccineStockRepository.findVaccineByObjectId.mockResolvedValue(vaccine)
    stockAdjustmentRepository.find.mockResolvedValue([
      { _id: '1', createdAt: new Date('2026-07-15T10:00:00.000Z') },
    ] as StockAdjustment[])

    await service.findVaccineStockHistory(vaccineId)

    expect(stockAdjustmentRepository.find).toHaveBeenCalledWith({
      where: { vaccineObjectId: vaccineObjectId },
      order: { createdAt: 'DESC' },
    })
  })

  it('returns VACCINE_NOT_FOUND for malformed vaccine IDs', async () => {
    await expect(
      service.adjustVaccineStock(adminUser, {
        vaccineId: 'invalid-id',
        type: StockAdjustmentType.RESTOCK,
        quantityDelta: 5,
        reason: 'Invalid',
      }),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)

    expect(vaccineStockRepository.adjustStockQuantity).not.toHaveBeenCalled()
    expect(stockAdjustmentWriter.insertManualAdjustment).not.toHaveBeenCalled()
  })

  it('returns VACCINE_NOT_FOUND for valid but nonexistent vaccine IDs', async () => {
    vaccineStockRepository.findVaccineByObjectId.mockResolvedValue(null)

    await expect(
      service.adjustVaccineStock(adminUser, {
        vaccineId: nonexistentVaccineId,
        type: StockAdjustmentType.RESTOCK,
        quantityDelta: 5,
        reason: 'Missing vaccine',
      }),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)

    expect(stockAdjustmentWriter.insertManualAdjustment).not.toHaveBeenCalled()
  })

  it('does not create an audit record when lookup fails', async () => {
    vaccineStockRepository.findVaccineByObjectId.mockResolvedValue(null)

    await expect(
      service.findVaccineStockHistory(nonexistentVaccineId),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)

    expect(stockAdjustmentWriter.insertManualAdjustment).not.toHaveBeenCalled()
  })

  it('rejects resulting negative stock without creating audit record', async () => {
    vaccineStockRepository.findVaccineByObjectId.mockResolvedValue(vaccine)
    vaccineStockRepository.adjustStockQuantity.mockResolvedValue(null)

    await expect(
      service.adjustVaccineStock(adminUser, {
        vaccineId,
        type: StockAdjustmentType.MANUAL_DECREASE,
        quantityDelta: -20,
        reason: 'Too much',
      }),
    ).rejects.toBeInstanceOf(InsufficientStockException)

    expect(stockAdjustmentWriter.insertManualAdjustment).not.toHaveBeenCalled()
  })

  it('allows multiple manual adjustments in succession', async () => {
    mockSuccessfulAdjustment(10, 15)

    await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.RESTOCK,
      quantityDelta: 5,
      reason: 'First restock',
    })

    mockSuccessfulAdjustment(15, 18)

    await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.RESTOCK,
      quantityDelta: 3,
      reason: 'Second restock',
    })

    expect(stockAdjustmentWriter.insertManualAdjustment).toHaveBeenCalledTimes(2)
  })

  it('manual correction sets stock to target quantity', async () => {
    mockSuccessfulAdjustment(10, 25)

    const result = await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.MANUAL_CORRECTION,
      targetQuantity: 25,
      reason: 'Inventory count',
    })

    expect(vaccineStockRepository.adjustStockQuantity).toHaveBeenCalledWith(
      vaccineObjectId,
      15,
    )
    expect(result.quantityBefore).toBe(10)
    expect(result.quantityAfter).toBe(25)
    expect(stockAdjustmentWriter.insertManualAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        type: StockAdjustmentType.MANUAL_CORRECTION,
        quantityDelta: 15,
      }),
    )
  })

  it('manual correction can decrease stock to target quantity', async () => {
    mockSuccessfulAdjustment(10, 3)

    await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.MANUAL_CORRECTION,
      targetQuantity: 3,
      reason: 'Inventory count',
    })

    expect(vaccineStockRepository.adjustStockQuantity).toHaveBeenCalledWith(
      vaccineObjectId,
      -7,
    )
  })

  it('rejects correction when target matches current stock', async () => {
    vaccineStockRepository.findVaccineByObjectId.mockResolvedValue(vaccine)

    await expect(
      service.adjustVaccineStock(adminUser, {
        vaccineId,
        type: StockAdjustmentType.MANUAL_CORRECTION,
        targetQuantity: 10,
        reason: 'No change',
      }),
    ).rejects.toBeInstanceOf(InvalidStockAdjustmentException)

    expect(vaccineStockRepository.adjustStockQuantity).not.toHaveBeenCalled()
    expect(stockAdjustmentWriter.insertManualAdjustment).not.toHaveBeenCalled()
  })

  it('rejects correction with quantityDelta instead of targetQuantity', async () => {
    vaccineStockRepository.findVaccineByObjectId.mockResolvedValue(vaccine)

    await expect(
      service.adjustVaccineStock(adminUser, {
        vaccineId,
        type: StockAdjustmentType.MANUAL_CORRECTION,
        quantityDelta: 5,
        reason: 'Invalid',
      }),
    ).rejects.toBeInstanceOf(InvalidStockAdjustmentException)

    expect(vaccineStockRepository.adjustStockQuantity).not.toHaveBeenCalled()
  })

  it('rejects zero delta', async () => {
    vaccineStockRepository.findVaccineByObjectId.mockResolvedValue(vaccine)

    await expect(
      service.adjustVaccineStock(adminUser, {
        vaccineId,
        type: StockAdjustmentType.RESTOCK,
        quantityDelta: 0,
        reason: 'Invalid',
      }),
    ).rejects.toBeInstanceOf(InvalidStockAdjustmentException)

    expect(vaccineStockRepository.adjustStockQuantity).not.toHaveBeenCalled()
  })

  it('evaluates low stock after successful adjustment', async () => {
    mockSuccessfulAdjustment(6, 5)

    await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.MANUAL_DECREASE,
      quantityDelta: -1,
      reason: 'Usage',
    })

    expect(
      stockNotificationService.notifyAdminsIfEnteredLowStock,
    ).toHaveBeenCalledWith(vaccine, 6, 5, expect.any(String))
  })
})

describe('StockService.applyDeliveryDecrement', () => {
  let service: StockService
  let stockAdjustmentWriter: jest.Mocked<
    Pick<
      StockAdjustmentRepository,
      'insertIdempotentAdjustment' | 'findByIdempotencyKey'
    >
  >
  let vaccineStockRepository: jest.Mocked<
    Pick<
      VaccineStockRepository,
      'findVaccineByObjectId' | 'adjustStockQuantity'
    >
  >
  let stockNotificationService: jest.Mocked<
    Pick<StockNotificationService, 'notifyAdminsIfEnteredLowStock'>
  >

  const orderId = '6a569d2cbb2590db980429cd'
  const vaccineId = '507f1f77bcf86cd799439011'
  const vaccineObjectId = new ObjectId(vaccineId)

  const adminUser: User = {
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

  const vaccine: Vaccine = {
    _id: vaccineId,
    id: vaccineId,
    name: 'Influenza',
    normalizedName: 'influenza',
    description: '',
    manufacturer: 'PharmaCo',
    stockQuantity: 10,
    stockWarningThreshold: 5,
    active: true,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  beforeEach(async () => {
    stockAdjustmentWriter = {
      insertIdempotentAdjustment: jest.fn(),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    }

    vaccineStockRepository = {
      findVaccineByObjectId: jest.fn().mockResolvedValue(vaccine),
      adjustStockQuantity: jest.fn(),
    }

    stockNotificationService = {
      notifyAdminsIfEnteredLowStock: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        {
          provide: getRepositoryToken(StockAdjustment),
          useValue: { find: jest.fn() },
        },
        {
          provide: StockAdjustmentRepository,
          useValue: stockAdjustmentWriter,
        },
        {
          provide: VaccineStockRepository,
          useValue: vaccineStockRepository,
        },
        {
          provide: StockNotificationService,
          useValue: stockNotificationService,
        },
      ],
    }).compile()

    service = module.get(StockService)
  })

  it('decrements stock and creates DELIVERY_DEDUCTION adjustment', async () => {
    vaccineStockRepository.adjustStockQuantity.mockResolvedValue({
      quantityBefore: 10,
      quantityAfter: 5,
    })
    stockAdjustmentWriter.insertIdempotentAdjustment.mockResolvedValue(
      createStockAdjustmentInstance({
        _id: 'adjustment-id',
        type: StockAdjustmentType.DELIVERY_DEDUCTION,
        quantityDelta: -5,
        relatedOrderId: orderId,
        idempotencyKey: `delivery-decrement:${orderId}:${vaccineId}`,
      }),
    )

    const result = await service.applyDeliveryDecrement(adminUser, orderId, [
      { vaccineId, vaccineName: 'Influenza', quantity: 5 },
    ])

    expect(result.alreadyProcessed).toBe(false)
    expect(vaccineStockRepository.adjustStockQuantity).toHaveBeenCalledWith(
      vaccineObjectId,
      -5,
    )
    expect(stockAdjustmentWriter.insertIdempotentAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        type: StockAdjustmentType.DELIVERY_DEDUCTION,
        relatedOrderId: orderId,
        idempotencyKey: `delivery-decrement:${orderId}:${vaccineId}`,
      }),
    )
  })

  it('rolls back earlier decrements when a later line fails', async () => {
    const vaccineBId = '507f1f77bcf86cd799439022'
    const vaccineBObjectId = new ObjectId(vaccineBId)
    const vaccineB = {
      ...vaccine,
      _id: vaccineBId,
      id: vaccineBId,
      stockQuantity: 10,
    }

    vaccineStockRepository.findVaccineByObjectId.mockImplementation(objectId => {
      if (objectId.equals(vaccineObjectId)) {
        return Promise.resolve(vaccine)
      }

      if (objectId.equals(vaccineBObjectId)) {
        return Promise.resolve(vaccineB)
      }

      return Promise.resolve(null)
    })

    vaccineStockRepository.adjustStockQuantity
      .mockResolvedValueOnce({ quantityBefore: 10, quantityAfter: 5 })
      .mockResolvedValueOnce(null)

    await expect(
      service.applyDeliveryDecrement(adminUser, orderId, [
        { vaccineId, vaccineName: 'Influenza', quantity: 5 },
        { vaccineId: vaccineBId, vaccineName: 'Tetanus', quantity: 5 },
      ]),
    ).rejects.toBeInstanceOf(InsufficientStockException)

    expect(vaccineStockRepository.adjustStockQuantity).toHaveBeenCalledTimes(3)
    expect(vaccineStockRepository.adjustStockQuantity).toHaveBeenLastCalledWith(
      vaccineObjectId,
      5,
    )
    expect(stockAdjustmentWriter.insertIdempotentAdjustment).not.toHaveBeenCalled()
  })

  it('returns alreadyProcessed without decrementing again', async () => {
    stockAdjustmentWriter.findByIdempotencyKey.mockResolvedValue(
      createStockAdjustmentInstance({
        _id: 'existing',
        vaccineObjectId,
        type: StockAdjustmentType.DELIVERY_DEDUCTION,
        quantityDelta: -5,
        quantityBefore: 10,
        quantityAfter: 5,
        reason: 'existing',
        performedByUserId: adminUser._id.toString(),
        relatedOrderId: orderId,
        idempotencyKey: `delivery-decrement:${orderId}:${vaccineId}`,
      }),
    )

    const result = await service.applyDeliveryDecrement(adminUser, orderId, [
      { vaccineId, vaccineName: 'Influenza', quantity: 5 },
    ])

    expect(result.alreadyProcessed).toBe(true)
    expect(vaccineStockRepository.adjustStockQuantity).not.toHaveBeenCalled()
  })

  it('rejects delivery when pre-validation shows insufficient stock', async () => {
    vaccineStockRepository.findVaccineByObjectId.mockResolvedValue({
      ...vaccine,
      id: vaccineId,
      stockQuantity: 2,
    })

    await expect(
      service.applyDeliveryDecrement(adminUser, orderId, [
        { vaccineId, vaccineName: 'Influenza', quantity: 5 },
      ]),
    ).rejects.toBeInstanceOf(InsufficientStockException)

    expect(vaccineStockRepository.adjustStockQuantity).not.toHaveBeenCalled()
    expect(stockAdjustmentWriter.insertIdempotentAdjustment).not.toHaveBeenCalled()
  })

  it('aggregates duplicate order lines defensively', async () => {
    vaccineStockRepository.adjustStockQuantity.mockResolvedValue({
      quantityBefore: 10,
      quantityAfter: 4,
    })
    stockAdjustmentWriter.insertIdempotentAdjustment.mockResolvedValue(
      createStockAdjustmentInstance({
        _id: 'adjustment-id',
        type: StockAdjustmentType.DELIVERY_DEDUCTION,
      }),
    )

    await service.applyDeliveryDecrement(adminUser, orderId, [
      { vaccineId, vaccineName: 'Influenza', quantity: 3 },
      { vaccineId, vaccineName: 'Influenza', quantity: 3 },
    ])

    expect(vaccineStockRepository.adjustStockQuantity).toHaveBeenCalledWith(
      vaccineObjectId,
      -6,
    )
  })
})

describe('StockNotificationService', () => {
  let service: StockNotificationService
  let notificationService: jest.Mocked<
    Pick<NotificationService, 'createNotification'>
  >
  let userService: jest.Mocked<Pick<UserService, 'findUsersByRole'>>

  const vaccine: Vaccine = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    name: 'Influenza',
    normalizedName: 'influenza',
    description: '',
    manufacturer: 'PharmaCo',
    stockQuantity: 5,
    stockWarningThreshold: 5,
    active: true,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

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

  beforeEach(() => {
    notificationService = {
      createNotification: jest.fn().mockResolvedValue({}),
    }

    userService = {
      findUsersByRole: jest.fn().mockResolvedValue([admin]),
    }

    service = new StockNotificationService(
      notificationService as unknown as NotificationService,
      userService as unknown as UserService,
      { publish: jest.fn() } as never,
    )
  })

  it('creates low-stock notification when crossing threshold', async () => {
    await service.notifyAdminsIfEnteredLowStock(vaccine, 6, 5, 'adjustment-1')

    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: admin._id.toString(),
        type: NotificationType.LOW_STOCK_WARNING,
        deduplicationKey: 'low-stock:507f1f77bcf86cd799439011:adjustment-1',
      }),
    )
  })
})

describe('VaccineStockRepository', () => {
  let repository: VaccineStockRepository
  let vaccineRepository: jest.Mocked<
    Pick<MongoRepository<Vaccine>, 'findOne' | 'findOneAndUpdate'>
  >

  const vaccineId = '507f1f77bcf86cd799439011'
  const vaccineObjectId = new ObjectId(vaccineId)

  beforeEach(() => {
    vaccineRepository = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    }

    repository = new VaccineStockRepository(
      vaccineRepository as unknown as MongoRepository<Vaccine>,
    )
  })

  it('finds vaccines by GraphQL string ID using ObjectId conversion', async () => {
    vaccineRepository.findOne.mockResolvedValue({ _id: vaccineId } as Vaccine)

    const result = await repository.findVaccineByGraphqlId(vaccineId)

    expect(vaccineRepository.findOne).toHaveBeenCalledWith({
      where: { _id: vaccineObjectId },
    })
    expect(result).not.toBeNull()
  })

  it('returns null for malformed GraphQL IDs', async () => {
    await expect(repository.findVaccineByGraphqlId('invalid-id')).resolves.toBeNull()
    expect(vaccineRepository.findOne).not.toHaveBeenCalled()
  })

  it('uses conditional update for negative adjustments', async () => {
    vaccineRepository.findOneAndUpdate.mockResolvedValue({
      stockQuantity: 7,
    })

    const result = await repository.adjustStockQuantity(vaccineObjectId, -3)

    expect(vaccineRepository.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: vaccineObjectId,
        stockQuantity: { $gte: 3 },
      },
      { $inc: { stockQuantity: -3 } },
      { returnDocument: 'after' },
    )
    expect(result).toEqual({ quantityBefore: 10, quantityAfter: 7 })
  })
})
