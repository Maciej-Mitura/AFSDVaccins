import { Field, ObjectType } from '@nestjs/graphql'
import { Column } from 'typeorm'

/**
 * Delivery tracking embedded on each persisted notification.
 * Source of truth remains the Notification document; this records in-app/push attempts.
 */
@ObjectType('NotificationDeliveryState')
export class NotificationDeliveryState {
  @Column()
  @Field()
  inAppCreatedAt!: Date

  @Column({ nullable: true })
  @Field(() => Date, { nullable: true })
  pushRequestedAt?: Date | null

  @Column({ nullable: true })
  @Field(() => Date, { nullable: true })
  pushDeliveredAt?: Date | null

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  pushFailureCode?: string | null
}
