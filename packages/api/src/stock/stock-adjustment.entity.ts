import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
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
  _id!: string

  @Field(() => ID)
  get id(): string {
    return this._id
  }

  @Index()
  @Column()
  @Field(() => ID)
  vaccineId!: string

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
   * Omitted entirely for manual ADMIN adjustments.
   * Sparse unique index applies only when this field is present (Phase 10 delivery idempotency).
   */
  @Index({ unique: true, sparse: true })
  @Column({ nullable: true })
  idempotencyKey?: string

  @CreateDateColumn()
  @Field()
  createdAt!: Date
}
