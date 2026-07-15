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
import { VaccineService } from '../vaccine/vaccine.service'
import { StockAdjustmentType } from './stock-adjustment-type.enum'
import { StockAdjustment } from './stock-adjustment.entity'
import {
  InsufficientStockException,
  InvalidStockAdjustmentException,
  VaccineNotFoundException,
} from './exceptions/stock.exceptions'
import { StockNotificationService } from './stock-notification.service'
import { StockService } from './stock.service'
import { VaccineStockRepository } from './vaccine-stock.repository'

describe('StockService', () => {
  let service: StockService
  let stockAdjustmentRepository: jest.Mocked<
    Pick<MongoRepository<StockAdjustment>, 'create' | 'save' | 'find'>
  >
  let vaccineStockRepository: jest.Mocked<
    Pick<VaccineStockRepository, 'vaccineExists' | 'adjustStockQuantity'>
  >
  let vaccineService: jest.Mocked<Pick<VaccineService, 'findVaccineEntityById'>>
  let stockNotificationService: jest.Mocked<
    Pick<StockNotificationService, 'notifyAdminsIfEnteredLowStock'>
  >

  const vaccineId = '507f1f77bcf86cd799439011'
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
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    }

    vaccineStockRepository = {
      vaccineExists: jest.fn(),
      adjustStockQuantity: jest.fn(),
    }

    vaccineService = {
      findVaccineEntityById: jest.fn(),
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
          provide: VaccineStockRepository,
          useValue: vaccineStockRepository,
        },
        {
          provide: VaccineService,
          useValue: vaccineService,
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
    vaccineStockRepository.vaccineExists.mockResolvedValue(true)
    vaccineStockRepository.adjustStockQuantity.mockResolvedValue({
      quantityBefore,
      quantityAfter,
    })
    stockAdjustmentRepository.create.mockImplementation(
      value => value as StockAdjustment,
    )
    stockAdjustmentRepository.save.mockImplementation(value =>
      Promise.resolve({
        ...value,
        _id: adjustmentId,
        id: adjustmentId,
        createdAt: new Date('2026-07-14T12:00:00.000Z'),
      } as StockAdjustment),
    )
    vaccineService.findVaccineEntityById.mockResolvedValue({
      ...vaccine,
      id: vaccineId,
      stockQuantity: quantityAfter,
    })
  }

  it('positive restock updates balance and persists audit', async () => {
    mockSuccessfulAdjustment(10, 25)

    const result = await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.RESTOCK,
      quantityDelta: 15,
      reason: 'Weekly delivery',
    })

    expect(vaccineStockRepository.adjustStockQuantity).toHaveBeenCalledWith(
      vaccineId,
      15,
    )
    expect(result.quantityBefore).toBe(10)
    expect(result.quantityAfter).toBe(25)
    expect(result.performedByUserId).toBe(adminUser._id.toString())
    expect(stockAdjustmentRepository.save).toHaveBeenCalledTimes(1)
    expect(stockAdjustmentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        vaccineId,
        performedByUserId: adminUser._id.toString(),
      }),
    )
    expect(
      (stockAdjustmentRepository.create.mock.calls[0]?.[0] as StockAdjustment)
        .idempotencyKey,
    ).toBeUndefined()
  })

  it('negative decrease updates balance', async () => {
    mockSuccessfulAdjustment(10, 7)

    const result = await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.MANUAL_DECREASE,
      quantityDelta: -3,
      reason: 'Damaged doses',
    })

    expect(result.quantityAfter).toBe(7)
  })

  it('manual correction supports positive and negative delta', async () => {
    mockSuccessfulAdjustment(10, 9)

    await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.MANUAL_CORRECTION,
      quantityDelta: -1,
      reason: 'Count correction',
    })

    mockSuccessfulAdjustment(9, 11)

    await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.MANUAL_CORRECTION,
      quantityDelta: 2,
      reason: 'Count correction',
    })

    expect(vaccineStockRepository.adjustStockQuantity).toHaveBeenLastCalledWith(
      vaccineId,
      2,
    )
  })

  it('rejects zero delta', async () => {
    await expect(
      service.adjustVaccineStock(adminUser, {
        vaccineId,
        type: StockAdjustmentType.MANUAL_CORRECTION,
        quantityDelta: 0,
        reason: 'Invalid',
      }),
    ).rejects.toBeInstanceOf(InvalidStockAdjustmentException)

    expect(vaccineStockRepository.adjustStockQuantity).not.toHaveBeenCalled()
  })

  it('rejects invalid type and delta combinations', async () => {
    await expect(
      service.adjustVaccineStock(adminUser, {
        vaccineId,
        type: StockAdjustmentType.RESTOCK,
        quantityDelta: -5,
        reason: 'Invalid',
      }),
    ).rejects.toBeInstanceOf(InvalidStockAdjustmentException)

    await expect(
      service.adjustVaccineStock(adminUser, {
        vaccineId,
        type: StockAdjustmentType.MANUAL_DECREASE,
        quantityDelta: 5,
        reason: 'Invalid',
      }),
    ).rejects.toBeInstanceOf(InvalidStockAdjustmentException)
  })

  it('rejects resulting negative stock', async () => {
    vaccineStockRepository.vaccineExists.mockResolvedValue(true)
    vaccineStockRepository.adjustStockQuantity.mockResolvedValue(null)

    await expect(
      service.adjustVaccineStock(adminUser, {
        vaccineId,
        type: StockAdjustmentType.MANUAL_DECREASE,
        quantityDelta: -20,
        reason: 'Too much',
      }),
    ).rejects.toBeInstanceOf(InsufficientStockException)

    expect(stockAdjustmentRepository.save).not.toHaveBeenCalled()
  })

  it('handles vaccine not found safely', async () => {
    vaccineStockRepository.vaccineExists.mockResolvedValue(false)

    await expect(
      service.adjustVaccineStock(adminUser, {
        vaccineId,
        type: StockAdjustmentType.RESTOCK,
        quantityDelta: 5,
        reason: 'Missing vaccine',
      }),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)
  })

  it('derives performing user from authenticated user', async () => {
    mockSuccessfulAdjustment(10, 12)

    const result = await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.RESTOCK,
      quantityDelta: 2,
      reason: 'Restock',
    })

    expect(result.performedByUserId).toBe(adminUser._id.toString())
  })

  it('persists one adjustment record per successful update', async () => {
    mockSuccessfulAdjustment(10, 12)

    await service.adjustVaccineStock(adminUser, {
      vaccineId,
      type: StockAdjustmentType.RESTOCK,
      quantityDelta: 2,
      reason: 'Restock',
    })

    expect(stockAdjustmentRepository.save).toHaveBeenCalledTimes(1)
  })

  it('returns stock history ordered newest first', async () => {
    vaccineStockRepository.vaccineExists.mockResolvedValue(true)
    stockAdjustmentRepository.find.mockResolvedValue([
      { _id: '1', createdAt: new Date('2026-07-15T10:00:00.000Z') },
      { _id: '2', createdAt: new Date('2026-07-14T10:00:00.000Z') },
    ] as StockAdjustment[])

    await service.findVaccineStockHistory(vaccineId)

    expect(stockAdjustmentRepository.find).toHaveBeenCalledWith({
      where: { vaccineId },
      order: { createdAt: 'DESC' },
    })
  })

  it('handles malformed vaccine IDs safely in history lookup', async () => {
    await expect(
      service.findVaccineStockHistory('invalid-id'),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)
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
    ).toHaveBeenCalledWith(
      expect.objectContaining({ _id: vaccineId }),
      6,
      5,
      expect.any(String),
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

  it('does not notify while already low', async () => {
    await service.notifyAdminsIfEnteredLowStock(vaccine, 4, 3, 'adjustment-2')

    expect(notificationService.createNotification).not.toHaveBeenCalled()
  })

  it('can notify again after recovery and later crossing', async () => {
    await service.notifyAdminsIfEnteredLowStock(vaccine, 6, 5, 'episode-a')
    await service.notifyAdminsIfEnteredLowStock(vaccine, 4, 3, 'episode-a-followup')
    await service.notifyAdminsIfEnteredLowStock(vaccine, 6, 4, 'episode-b')

    expect(notificationService.createNotification).toHaveBeenCalledTimes(2)
  })
})

describe('VaccineStockRepository', () => {
  let repository: VaccineStockRepository
  let vaccineRepository: jest.Mocked<
    Pick<MongoRepository<Vaccine>, 'count' | 'findOneAndUpdate'>
  >

  const vaccineId = '507f1f77bcf86cd799439011'

  beforeEach(() => {
    vaccineRepository = {
      count: jest.fn(),
      findOneAndUpdate: jest.fn(),
    }

    repository = new VaccineStockRepository(
      vaccineRepository as unknown as MongoRepository<Vaccine>,
    )
  })

  it('uses conditional update for negative adjustments', async () => {
    vaccineRepository.findOneAndUpdate.mockResolvedValue({
      stockQuantity: 7,
    })

    const result = await repository.adjustStockQuantity(vaccineId, -3)

    expect(vaccineRepository.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: new ObjectId(vaccineId),
        stockQuantity: { $gte: 3 },
      },
      { $inc: { stockQuantity: -3 } },
      { returnDocument: 'after' },
    )
    expect(result).toEqual({ quantityBefore: 10, quantityAfter: 7 })
  })
})
