import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../common/mongodb/graphql-object-id.util'
import { User } from '../user/user.entity'
import { AdjustStockInput } from './dto/adjust-stock.input'
import {
  InsufficientStockException,
  InvalidStockAdjustmentException,
  VaccineNotFoundException,
} from './exceptions/stock.exceptions'
import { StockAdjustmentType } from './stock-adjustment-type.enum'
import { StockAdjustment } from './stock-adjustment.entity'
import { StockAdjustmentRepository } from './stock-adjustment.repository'
import { StockNotificationService } from './stock-notification.service'
import { VaccineStockRepository } from './vaccine-stock.repository'

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(StockAdjustment)
    private readonly stockAdjustmentRepository: MongoRepository<StockAdjustment>,
    private readonly stockAdjustmentWriter: StockAdjustmentRepository,
    private readonly vaccineStockRepository: VaccineStockRepository,
    private readonly stockNotificationService: StockNotificationService,
  ) {}

  private resolveAdjustmentDelta(
    type: StockAdjustmentType,
    quantityDelta: number | undefined,
    targetQuantity: number | undefined,
    currentStock: number,
  ): number {
    switch (type) {
      case StockAdjustmentType.RESTOCK:
        if (targetQuantity !== undefined) {
          throw new InvalidStockAdjustmentException(
            'RESTOCK must not include targetQuantity',
          )
        }

        if (
          quantityDelta === undefined ||
          !Number.isInteger(quantityDelta) ||
          quantityDelta <= 0
        ) {
          throw new InvalidStockAdjustmentException(
            'RESTOCK requires a positive quantity delta',
          )
        }

        return quantityDelta
      case StockAdjustmentType.MANUAL_DECREASE:
        if (targetQuantity !== undefined) {
          throw new InvalidStockAdjustmentException(
            'MANUAL_DECREASE must not include targetQuantity',
          )
        }

        if (
          quantityDelta === undefined ||
          !Number.isInteger(quantityDelta) ||
          quantityDelta >= 0
        ) {
          throw new InvalidStockAdjustmentException(
            'MANUAL_DECREASE requires a negative quantity delta',
          )
        }

        return quantityDelta
      case StockAdjustmentType.MANUAL_CORRECTION:
        if (quantityDelta !== undefined) {
          throw new InvalidStockAdjustmentException(
            'MANUAL_CORRECTION must use targetQuantity, not quantityDelta',
          )
        }

        if (
          targetQuantity === undefined ||
          !Number.isInteger(targetQuantity) ||
          targetQuantity < 0
        ) {
          throw new InvalidStockAdjustmentException(
            'MANUAL_CORRECTION requires a non-negative targetQuantity',
          )
        }

        const delta = targetQuantity - currentStock

        if (delta === 0) {
          throw new InvalidStockAdjustmentException(
            'Target quantity matches current stock',
          )
        }

        return delta
      default:
        throw new InvalidStockAdjustmentException('Unsupported adjustment type')
    }
  }

  private async requireVaccineByGraphqlId(vaccineId: string) {
    const parsed = tryParseGraphqlObjectId(vaccineId)

    if (!parsed) {
      throw new VaccineNotFoundException()
    }

    const vaccine = await this.vaccineStockRepository.findVaccineByObjectId(
      parsed.objectId,
    )

    if (!vaccine) {
      throw new VaccineNotFoundException()
    }

    return {
      parsed,
      vaccine,
    }
  }

  async adjustVaccineStock(
    user: User,
    input: AdjustStockInput,
  ): Promise<StockAdjustment> {
    const { parsed, vaccine } = await this.requireVaccineByGraphqlId(
      input.vaccineId,
    )

    const quantityDelta = this.resolveAdjustmentDelta(
      input.type,
      input.quantityDelta,
      input.targetQuantity,
      vaccine.stockQuantity,
    )

    const updateResult = await this.vaccineStockRepository.adjustStockQuantity(
      parsed.objectId,
      quantityDelta,
    )

    if (!updateResult) {
      const stillExists = await this.vaccineStockRepository.findVaccineByObjectId(
        parsed.objectId,
      )

      if (!stillExists) {
        throw new VaccineNotFoundException()
      }

      throw new InsufficientStockException()
    }

    const savedAdjustment = await this.stockAdjustmentWriter.insertManualAdjustment(
      {
        vaccineObjectId: parsed.objectId,
        type: input.type,
        quantityDelta,
        quantityBefore: updateResult.quantityBefore,
        quantityAfter: updateResult.quantityAfter,
        reason: input.reason.trim(),
        performedByUserId: user._id.toString(),
        relatedOrderId: null,
      },
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
      const parsed = tryParseGraphqlObjectId(vaccineId)

      if (!parsed) {
        return []
      }

      return this.stockAdjustmentRepository.find({
        where: { vaccineObjectId: parsed.objectId },
        order: { createdAt: 'DESC' },
      })
    }

    return this.stockAdjustmentRepository.find({
      order: { createdAt: 'DESC' },
    })
  }

  async findVaccineStockHistory(vaccineId: string): Promise<StockAdjustment[]> {
    const { parsed } = await this.requireVaccineByGraphqlId(vaccineId)

    return this.stockAdjustmentRepository.find({
      where: { vaccineObjectId: parsed.objectId },
      order: { createdAt: 'DESC' },
    })
  }
}
