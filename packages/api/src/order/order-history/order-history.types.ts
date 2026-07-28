import { Field, ID, Int, ObjectType } from '@nestjs/graphql'

import { PageInfo } from '../../common/graphql/page-info.type'
import { Address } from '../../profile/address.type'
import { OrderLine } from '../order-line.entity'
import { OrderStatus } from '../order-status.enum'

@ObjectType('OrderHistoryPharmacy')
export class OrderHistoryPharmacy {
  @Field(() => ID)
  apothekerUserId!: string

  @Field(() => String, { nullable: true })
  pharmacyName?: string | null

  @Field(() => Address, { nullable: true })
  address?: Address | null
}

@ObjectType('OrderHistoryItem')
export class OrderHistoryItem {
  @Field(() => ID)
  id!: string

  @Field(() => OrderStatus)
  status!: OrderStatus

  @Field(() => [OrderLine])
  orderLines!: OrderLine[]

  @Field(() => Int)
  totalQuantity!: number

  @Field()
  submittedAt!: Date

  /** Planned delivery calendar day (YYYY-MM-DD), not a datetime. */
  @Field()
  deliveryDate!: string

  @Field(() => Date, { nullable: true })
  cancelledAt?: Date | null

  /**
   * Persisted delivery instant only. Never derived from updatedAt.
   * Null for legacy DELIVERED rows that lack deliveredAt.
   */
  @Field(() => Date, { nullable: true })
  deliveredAt?: Date | null

  /** Latest statusHistory CANCELLED entry reason; often null for pharmacist cancels. */
  @Field(() => String, { nullable: true })
  cancellationReason?: string | null

  @Field(() => OrderHistoryPharmacy, { nullable: true })
  pharmacy?: OrderHistoryPharmacy | null

  @Field(() => ID, { nullable: true })
  completedByUserId?: string | null

  @Field(() => String, { nullable: true })
  completedByDisplayName?: string | null

  /** Persisted deliveryMethod (`ADMIN` | `QR`); null when unknown/legacy. */
  @Field(() => String, { nullable: true })
  deliveryMethod?: string | null

  /**
   * Always null in Phase 35B2.
   * Resolving routeId requires an unindexed reverse scan of
   * delivery_routes.stops.orderIds — omitted to avoid per-order full scans.
   */
  @Field(() => ID, { nullable: true })
  routeId?: string | null
}

@ObjectType('OrderHistoryEdge')
export class OrderHistoryEdge {
  @Field()
  cursor!: string

  @Field(() => OrderHistoryItem)
  node!: OrderHistoryItem
}

@ObjectType('OrderHistoryConnection')
export class OrderHistoryConnection {
  @Field(() => [OrderHistoryEdge])
  edges!: OrderHistoryEdge[]

  @Field(() => PageInfo)
  pageInfo!: PageInfo

  @Field(() => Int, { nullable: true })
  totalCount?: number | null
}
