import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import { ObjectId } from 'mongodb'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
} from 'typeorm'

import { StockAdjustmentType } from './stock-adjustment-type.enum'

@Entity('stock_adjustments')
@ObjectType('StockAdjustment')
export class StockAdjustment {
  @ObjectIdColumn()
  _id!: string | ObjectId

  @Field(() => ID)
  get id(): string {
    return this._id instanceof ObjectId ? this._id.toString() : this._id
  }

  @Index()
  @Column()
  vaccineObjectId!: ObjectId

  @Column()
  @Field(() => StockAdjustmentType)
  type!: StockAdjustmentType

  @Column()
  @Field(() => Int)
  quantityDelta!: number

  @Column()
  @Field(() => Int)
  quantityBefore!: number

  @Column()
  @Field(() => Int)
  quantityAfter!: number

  @Column()
  @Field()
  reason!: string

  @Column()
  @Field(() => ID)
  performedByUserId!: string

  @Column({ nullable: true })
  @Field(() => ID, { nullable: true })
  relatedOrderId?: string | null

  /**
   * Present only for idempotent operations such as Phase 10 delivery decrement.
   * Manual ADMIN adjustments omit this property entirely.
   * Partial unique index is initialized by StockAdjustmentPersistenceService.
   */
  @Column()
  idempotencyKey?: string

  @CreateDateColumn()
  @Field()
  createdAt!: Date
}
