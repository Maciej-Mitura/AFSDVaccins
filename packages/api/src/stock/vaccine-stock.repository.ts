import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../common/mongodb/graphql-object-id.util'
import { Vaccine } from '../vaccine/vaccine.entity'

export type AtomicStockUpdateResult = {
  quantityBefore: number
  quantityAfter: number
}

type VaccineStockDocument = {
  stockQuantity: number
}

@Injectable()
export class VaccineStockRepository {
  constructor(
    @InjectRepository(Vaccine)
    private readonly vaccineRepository: MongoRepository<Vaccine>,
  ) {}

  async findVaccineByGraphqlId(vaccineId: string): Promise<Vaccine | null> {
    const parsed = tryParseGraphqlObjectId(vaccineId)

    if (!parsed) {
      return null
    }

    return this.findVaccineByObjectId(parsed.objectId)
  }

  async findVaccineByObjectId(objectId: ObjectId): Promise<Vaccine | null> {
    return this.vaccineRepository.findOne({
      where: { _id: objectId },
    })
  }

  /**
   * Atomically adjusts stockQuantity via a single MongoDB findOneAndUpdate.
   * Negative deltas use a conditional filter so concurrent decreases cannot go below zero.
   */
  async adjustStockQuantity(
    objectId: ObjectId,
    quantityDelta: number,
  ): Promise<AtomicStockUpdateResult | null> {
    if (quantityDelta > 0) {
      const updatedDocument = await this.vaccineRepository.findOneAndUpdate(
        { _id: objectId },
        { $inc: { stockQuantity: quantityDelta } },
        { returnDocument: 'after' },
      )

      if (!updatedDocument) {
        return null
      }

      const document = updatedDocument as VaccineStockDocument

      return {
        quantityBefore: document.stockQuantity - quantityDelta,
        quantityAfter: document.stockQuantity,
      }
    }

    const requiredStock = Math.abs(quantityDelta)
    const updatedDocument = await this.vaccineRepository.findOneAndUpdate(
      {
        _id: objectId,
        stockQuantity: { $gte: requiredStock },
      },
      { $inc: { stockQuantity: quantityDelta } },
      { returnDocument: 'after' },
    )

    if (!updatedDocument) {
      return null
    }

    const document = updatedDocument as VaccineStockDocument

    return {
      quantityBefore: document.stockQuantity - quantityDelta,
      quantityAfter: document.stockQuantity,
    }
  }
}
