import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { User } from '../user/user.entity'
import { VaccineService } from '../vaccine/vaccine.service'
import { AdjustStockInput } from './dto/adjust-stock.input'
import {
  InsufficientStockException,
  InvalidStockAdjustmentException,
  VaccineNotFoundException,
} from './exceptions/stock.exceptions'
import { StockAdjustmentType } from './stock-adjustment-type.enum'
import { StockAdjustment } from './stock-adjustment.entity'
import { StockNotificationService } from './stock-notification.service'
import { VaccineStockRepository } from './vaccine-stock.repository'

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(StockAdjustment)
    private readonly stockAdjustmentRepository: MongoRepository<StockAdjustment>,
    private readonly vaccineStockRepository: VaccineStockRepository,
    private readonly vaccineService: VaccineService,
    private readonly stockNotificationService: StockNotificationService,
  ) {}

  private validateTypeAndDelta(
    type: StockAdjustmentType,
    quantityDelta: number,
  ): void {
    if (quantityDelta === 0) {
      throw new InvalidStockAdjustmentException('Quantity delta cannot be zero')
    }

    switch (type) {
      case StockAdjustmentType.RESTOCK:
        if (quantityDelta <= 0) {
          throw new InvalidStockAdjustmentException(
            'RESTOCK requires a positive quantity delta',
          )
        }
        break
      case StockAdjustmentType.MANUAL_DECREASE:
        if (quantityDelta >= 0) {
          throw new InvalidStockAdjustmentException(
            'MANUAL_DECREASE requires a negative quantity delta',
          )
        }
        break
      case StockAdjustmentType.MANUAL_CORRECTION:
        break
      default:
        throw new InvalidStockAdjustmentException('Unsupported adjustment type')
    }
  }

  async adjustVaccineStock(
    user: User,
    input: AdjustStockInput,
  ): Promise<StockAdjustment> {
    this.validateTypeAndDelta(input.type, input.quantityDelta)

    const vaccineExists = await this.vaccineStockRepository.vaccineExists(
      input.vaccineId,
    )

    if (!vaccineExists) {
      throw new VaccineNotFoundException()
    }

    const updateResult = await this.vaccineStockRepository.adjustStockQuantity(
      input.vaccineId,
      input.quantityDelta,
    )

    if (!updateResult) {
      const stillExists = await this.vaccineStockRepository.vaccineExists(
        input.vaccineId,
      )

      if (!stillExists) {
        throw new VaccineNotFoundException()
      }

      throw new InsufficientStockException()
    }

    const adjustmentPayload: Partial<StockAdjustment> = {
      vaccineId: input.vaccineId,
      type: input.type,
      quantityDelta: input.quantityDelta,
      quantityBefore: updateResult.quantityBefore,
      quantityAfter: updateResult.quantityAfter,
      reason: input.reason.trim(),
      performedByUserId: user._id.toString(),
      relatedOrderId: null,
    }

    const adjustment = this.stockAdjustmentRepository.create(adjustmentPayload)
    const savedAdjustment = await this.stockAdjustmentRepository.save(adjustment)

    const vaccine = await this.vaccineService.findVaccineEntityById(
      input.vaccineId,
    )

    await this.stockNotificationService.notifyAdminsIfEnteredLowStock(
      vaccine,
      updateResult.quantityBefore,
      updateResult.quantityAfter,
      savedAdjustment._id.toString(),
    )

    return savedAdjustment
  }

  async findStockAdjustments(vaccineId?: string): Promise<StockAdjustment[]> {
    if (vaccineId !== undefined) {
      if (!ObjectId.isValid(vaccineId)) {
        return []
      }

      return this.stockAdjustmentRepository.find({
        where: { vaccineId },
        order: { createdAt: 'DESC' },
      })
    }

    return this.stockAdjustmentRepository.find({
      order: { createdAt: 'DESC' },
    })
  }

  async findVaccineStockHistory(vaccineId: string): Promise<StockAdjustment[]> {
    if (!ObjectId.isValid(vaccineId)) {
      throw new VaccineNotFoundException()
    }

    const vaccineExists = await this.vaccineStockRepository.vaccineExists(
      vaccineId,
    )

    if (!vaccineExists) {
      throw new VaccineNotFoundException()
    }

    return this.stockAdjustmentRepository.find({
      where: { vaccineId },
      order: { createdAt: 'DESC' },
    })
  }
}
