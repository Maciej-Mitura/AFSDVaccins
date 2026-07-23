import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { ApplicationCacheService } from '../common/cache/application-cache.service'
import { tryParseGraphqlObjectId } from '../common/mongodb/graphql-object-id.util'
import { User } from '../user/user.entity'
import { Vaccine } from '../vaccine/vaccine.entity'
import { AdjustStockInput } from './dto/adjust-stock.input'
import {
  AppliedDeliveryDecrement,
  aggregateOrderLinesByVaccine,
  buildDeliveryDecrementIdempotencyKey,
  DeliveryDecrementResult,
} from './delivery-decrement.types'
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

type PendingBalanceDecrement = {
  vaccineObjectId: ObjectId
  vaccine: Vaccine
  quantity: number
  quantityBefore: number
  quantityAfter: number
  idempotencyKey: string
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  )
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name)

  constructor(
    @InjectRepository(StockAdjustment)
    private readonly stockAdjustmentRepository: MongoRepository<StockAdjustment>,
    private readonly stockAdjustmentWriter: StockAdjustmentRepository,
    private readonly vaccineStockRepository: VaccineStockRepository,
    private readonly stockNotificationService: StockNotificationService,
    private readonly applicationCache: ApplicationCacheService,
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
      case StockAdjustmentType.MANUAL_CORRECTION: {
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

        const correctionDelta = targetQuantity - currentStock

        if (correctionDelta === 0) {
          throw new InvalidStockAdjustmentException(
            'Target quantity matches current stock',
          )
        }

        return correctionDelta
      }
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

  private async rollbackPendingDecrements(
    pendingDecrements: PendingBalanceDecrement[],
  ): Promise<void> {
    for (const pending of [...pendingDecrements].reverse()) {
      const restored = await this.vaccineStockRepository.adjustStockQuantity(
        pending.vaccineObjectId,
        pending.quantity,
      )

      if (!restored) {
        this.logger.error(
          `Failed to restore stock for vaccine ${pending.vaccineObjectId.toString()} after delivery rollback`,
        )
      }
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

    // Catalogue cache includes stockQuantity — invalidate after successful write.
    await this.applicationCache.invalidateVaccines()

    return savedAdjustment
  }

  async applyDeliveryDecrement(
    adminUser: User,
    orderId: string,
    orderLines: Array<{
      vaccineId: string
      vaccineName: string
      quantity: number
    }>,
  ): Promise<DeliveryDecrementResult> {
    const aggregatedLines = [...aggregateOrderLinesByVaccine(orderLines).values()]

    if (aggregatedLines.length === 0) {
      return { alreadyProcessed: true, decrements: [] }
    }

    const existingAdjustments: AppliedDeliveryDecrement[] = []

    for (const line of aggregatedLines) {
      const idempotencyKey = buildDeliveryDecrementIdempotencyKey(
        orderId,
        line.vaccineId,
      )
      const existing =
        await this.stockAdjustmentWriter.findByIdempotencyKey(idempotencyKey)

      if (existing) {
        existingAdjustments.push({
          vaccineId: line.vaccineId,
          vaccineObjectId: existing.vaccineObjectId,
          vaccineName: line.vaccineName,
          quantity: Math.abs(existing.quantityDelta),
          quantityBefore: existing.quantityBefore,
          quantityAfter: existing.quantityAfter,
          idempotencyKey,
        })
      }
    }

    if (existingAdjustments.length === aggregatedLines.length) {
      return {
        alreadyProcessed: true,
        decrements: existingAdjustments,
      }
    }

    if (existingAdjustments.length > 0) {
      throw new InsufficientStockException()
    }

    const requirements: PendingBalanceDecrement[] = []

    for (const line of aggregatedLines) {
      const { parsed, vaccine } = await this.requireVaccineByGraphqlId(
        line.vaccineId,
      )

      if (vaccine.stockQuantity < line.quantity) {
        throw new InsufficientStockException()
      }

      requirements.push({
        vaccineObjectId: parsed.objectId,
        vaccine,
        quantity: line.quantity,
        quantityBefore: vaccine.stockQuantity,
        quantityAfter: vaccine.stockQuantity - line.quantity,
        idempotencyKey: buildDeliveryDecrementIdempotencyKey(
          orderId,
          line.vaccineId,
        ),
      })
    }

    const pendingDecrements: PendingBalanceDecrement[] = []

    try {
      for (const requirement of requirements) {
        const updateResult =
          await this.vaccineStockRepository.adjustStockQuantity(
            requirement.vaccineObjectId,
            -requirement.quantity,
          )

        if (!updateResult) {
          await this.rollbackPendingDecrements(pendingDecrements)
          throw new InsufficientStockException()
        }

        pendingDecrements.push({
          ...requirement,
          quantityBefore: updateResult.quantityBefore,
          quantityAfter: updateResult.quantityAfter,
        })
      }
    } catch (error) {
      if (!(error instanceof InsufficientStockException)) {
        await this.rollbackPendingDecrements(pendingDecrements)
      }

      throw error
    }

    const appliedDecrements: AppliedDeliveryDecrement[] = []

    try {
      for (const pending of pendingDecrements) {
        const savedAdjustment =
          await this.stockAdjustmentWriter.insertIdempotentAdjustment({
            vaccineObjectId: pending.vaccineObjectId,
            type: StockAdjustmentType.DELIVERY_DEDUCTION,
            quantityDelta: -pending.quantity,
            quantityBefore: pending.quantityBefore,
            quantityAfter: pending.quantityAfter,
            reason: `Delivery decrement for order ${orderId}`,
            performedByUserId: adminUser._id.toString(),
            relatedOrderId: orderId,
            idempotencyKey: pending.idempotencyKey,
          })

        appliedDecrements.push({
          vaccineId: pending.vaccine._id.toString(),
          vaccineObjectId: pending.vaccineObjectId,
          vaccineName: pending.vaccine.name,
          quantity: pending.quantity,
          quantityBefore: pending.quantityBefore,
          quantityAfter: pending.quantityAfter,
          idempotencyKey: pending.idempotencyKey,
        })

        await this.stockNotificationService.notifyAdminsIfEnteredLowStock(
          pending.vaccine,
          pending.quantityBefore,
          pending.quantityAfter,
          savedAdjustment._id.toString(),
        )
      }
    } catch (error) {
      await this.rollbackPendingDecrements(pendingDecrements)

      if (isDuplicateKeyError(error)) {
        return this.applyDeliveryDecrement(adminUser, orderId, orderLines)
      }

      throw error
    }

    await this.applicationCache.invalidateVaccines()

    return {
      alreadyProcessed: false,
      decrements: appliedDecrements,
    }
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
