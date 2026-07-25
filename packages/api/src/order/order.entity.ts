import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
  UpdateDateColumn,
} from 'typeorm'

import { OrderLine } from './order-line.entity'
import { OrderStatusHistoryEntry } from './order-status-history.type'
import { OrderStatus } from './order-status.enum'

@Entity('orders')
@ObjectType('Order')
export class Order {
  @ObjectIdColumn()
  _id!: string

  @Field(() => ID)
  get id(): string {
    return this._id
  }

  @Index()
  @Column()
  @Field(() => ID)
  apothekerId!: string

  @Index()
  @Column({ default: OrderStatus.PENDING })
  @Field(() => OrderStatus)
  status!: OrderStatus

  @Column()
  @Field(() => [OrderLine])
  orderLines!: OrderLine[]

  @Column()
  @Field(() => Int)
  totalQuantity!: number

  @Index()
  @Column()
  @Field(() => Int)
  isoWeek!: number

  @Index()
  @Column()
  @Field(() => Int)
  isoYear!: number

  @Column()
  @Field()
  submittedAt!: Date

  @Column({ nullable: true })
  @Field(() => Date, { nullable: true })
  cancelledAt?: Date | null

  @Column({ default: [] })
  @Field(() => [OrderStatusHistoryEntry], { defaultValue: [] })
  statusHistory?: OrderStatusHistoryEntry[]

  @Column({ nullable: true })
  @Field(() => Date, { nullable: true })
  stockDecrementedAt?: Date | null

  /** When the order became DELIVERED (ADMIN or QR). Persistence-only. */
  @Column({ nullable: true })
  deliveredAt?: Date | null

  /** User who marked the order delivered (ADMIN or courier). Persistence-only. */
  @Column({ nullable: true })
  deliveredByUserId?: string | null

  /**
   * Delivery channel provenance (`ADMIN` | `QR`). Persistence-only.
   * Legacy DELIVERED rows may omit this field.
   */
  @Column({ nullable: true })
  deliveryMethod?: string | null

  /**
   * QR confirmationEventId when delivered via Phase 26D. Persistence-only.
   * Null for ADMIN / legacy deliveries — QR resume rejects unrelated DELIVERED.
   */
  @Column({ nullable: true })
  deliveryConfirmationEventId?: string | null

  @Column()
  @Field()
  deliveryDate!: string

  @CreateDateColumn()
  @Field()
  createdAt!: Date

  @UpdateDateColumn()
  @Field()
  updatedAt!: Date
}
