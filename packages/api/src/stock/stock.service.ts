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
    this.validateTypeAndDelta(input.type, input.quantityDelta)

    const { parsed, vaccine } = await this.requireVaccineByGraphqlId(
      input.vaccineId,
    )

    const updateResult = await this.vaccineStockRepository.adjustStockQuantity(
      parsed.objectId,
      input.quantityDelta,
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
        quantityDelta: input.quantityDelta,
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
