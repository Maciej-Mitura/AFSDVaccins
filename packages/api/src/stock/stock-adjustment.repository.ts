import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { StockAdjustmentType } from './stock-adjustment-type.enum'
import { StockAdjustment } from './stock-adjustment.entity'

export type ManualStockAdjustmentInsert = {
  vaccineObjectId: ObjectId
  type: StockAdjustmentType
  quantityDelta: number
  quantityBefore: number
  quantityAfter: number
  reason: string
  performedByUserId: string
  relatedOrderId?: string | null
}

export type IdempotentStockAdjustmentInsert = ManualStockAdjustmentInsert & {
  idempotencyKey: string
}

@Injectable()
export class StockAdjustmentRepository {
  constructor(
    @InjectRepository(StockAdjustment)
    private readonly stockAdjustmentRepository: MongoRepository<StockAdjustment>,
  ) {}

  async insertManualAdjustment(
    payload: ManualStockAdjustmentInsert,
  ): Promise<StockAdjustment> {
    const document = {
      vaccineObjectId: payload.vaccineObjectId,
      type: payload.type,
      quantityDelta: payload.quantityDelta,
      quantityBefore: payload.quantityBefore,
      quantityAfter: payload.quantityAfter,
      reason: payload.reason,
      performedByUserId: payload.performedByUserId,
      relatedOrderId: payload.relatedOrderId ?? null,
      createdAt: new Date(),
    }

    const insertResult = await this.stockAdjustmentRepository.insertOne(document)

    return {
      _id: insertResult.insertedId.toString(),
      ...document,
    } as StockAdjustment
  }

  async insertIdempotentAdjustment(
    payload: IdempotentStockAdjustmentInsert,
  ): Promise<StockAdjustment> {
    const document = {
      vaccineObjectId: payload.vaccineObjectId,
      type: payload.type,
      quantityDelta: payload.quantityDelta,
      quantityBefore: payload.quantityBefore,
      quantityAfter: payload.quantityAfter,
      reason: payload.reason,
      performedByUserId: payload.performedByUserId,
      relatedOrderId: payload.relatedOrderId ?? null,
      idempotencyKey: payload.idempotencyKey,
      createdAt: new Date(),
    }

    const insertResult = await this.stockAdjustmentRepository.insertOne(document)

    return {
      _id: insertResult.insertedId.toString(),
      ...document,
    } as StockAdjustment
  }
}
