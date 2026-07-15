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
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
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
    expect(stockAdjustmentRepository.save).toHaveBeenCalledTimes(1)
    expect(stockAdjustmentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        vaccineObjectId: vaccineObjectId,
        performedByUserId: adminUser._id.toString(),
      }),
    )
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
    expect(stockAdjustmentRepository.save).not.toHaveBeenCalled()
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

    expect(stockAdjustmentRepository.save).not.toHaveBeenCalled()
  })

  it('does not create an audit record when lookup fails', async () => {
    vaccineStockRepository.findVaccineByObjectId.mockResolvedValue(null)

    await expect(
      service.findVaccineStockHistory(nonexistentVaccineId),
    ).rejects.toBeInstanceOf(VaccineNotFoundException)

    expect(stockAdjustmentRepository.save).not.toHaveBeenCalled()
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

    expect(stockAdjustmentRepository.save).not.toHaveBeenCalled()
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
