import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
  UpdateDateColumn,
} from 'typeorm'

/**
 * Browser Web Push subscription per user/device.
 * Raw endpoint/keys are persisted for delivery but never exposed via GraphQL.
 */
@Entity('push_subscriptions')
@ObjectType('PushSubscriptionRecord')
@Index('UQ_push_subscriptions_user_endpoint_hash', ['userId', 'endpointHash'], {
  unique: true,
})
export class PushSubscriptionEntity {
  @ObjectIdColumn()
  _id!: string

  @Field(() => ID)
  get id(): string {
    return this._id
  }

  @Index()
  @Column()
  userId!: string

  @Column()
  endpointHash!: string

  /** Raw endpoint — never @Field */
  @Column()
  endpoint!: string

  /** Raw p256dh — never @Field */
  @Column()
  p256dh!: string

  /** Raw auth — never @Field */
  @Column()
  auth!: string

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  userAgentSummary?: string | null

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  deviceLabel?: string | null

  @CreateDateColumn()
  @Field()
  createdAt!: Date

  @UpdateDateColumn()
  @Field()
  updatedAt!: Date

  @Column({ nullable: true })
  @Field(() => Date, { nullable: true })
  lastSuccessfulPushAt?: Date | null

  @Column({ nullable: true })
  @Field(() => Date, { nullable: true })
  lastFailureAt?: Date | null

  @Column({ nullable: true })
  @Field(() => Date, { nullable: true })
  disabledAt?: Date | null

  @Column({ default: 0 })
  @Field(() => Int)
  failureCount!: number

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  permissionState?: string | null
}

@ObjectType('PushCapabilityStatus')
export class PushCapabilityStatus {
  @Field()
  enabled!: boolean

  @Field(() => Int)
  subscriptionCount!: number

  @Field(() => String, { nullable: true })
  provider!: string | null

  @Field(() => String, { nullable: true })
  vapidPublicKey!: string | null

  @Field(() => String, { nullable: true })
  permissionGuidance!: string | null
}
