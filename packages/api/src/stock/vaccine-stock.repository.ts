import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

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

  async vaccineExists(vaccineId: string): Promise<boolean> {
    if (!ObjectId.isValid(vaccineId)) {
      return false
    }

    const count = await this.vaccineRepository.count({
      where: { _id: new ObjectId(vaccineId) },
    })

    return count > 0
  }

  /**
   * Atomically adjusts stockQuantity via a single MongoDB findOneAndUpdate.
   * Negative deltas use a conditional filter so concurrent decreases cannot go below zero.
   */
  async adjustStockQuantity(
    vaccineId: string,
    quantityDelta: number,
  ): Promise<AtomicStockUpdateResult | null> {
    if (!ObjectId.isValid(vaccineId)) {
      return null
    }

    const objectId = new ObjectId(vaccineId)

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
