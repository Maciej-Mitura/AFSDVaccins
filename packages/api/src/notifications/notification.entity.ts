import { Field, ID, ObjectType } from '@nestjs/graphql'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
} from 'typeorm'

import { UserRole } from '../user/user-role.enum'
import { NotificationDeliveryState } from './notification-delivery-state'
import { NotificationInterpolationDataFields } from './notification-interpolation-data.fields'
import { NotificationType } from './notification-type.enum'

@Entity('notifications')
@ObjectType('Notification')
export class Notification {
  @ObjectIdColumn()
  _id!: string

  @Field(() => ID)
  get id(): string {
    return this._id
  }

  @Index()
  @Column()
  @Field(() => ID)
  recipientUserId!: string

  @Column({ nullable: true })
  @Field(() => UserRole, { nullable: true })
  recipientRole?: UserRole | null

  @Index()
  @Column()
  @Field(() => NotificationType)
  type!: NotificationType

  /**
   * Legacy persisted Dutch copy for pre–Phase 27A notifications.
   * Phase 27A types prefer titleKey + client i18n; title may mirror the key.
   */
  @Column()
  @Field()
  title!: string

  @Column()
  @Field()
  body!: string

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  titleKey?: string | null

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  bodyKey?: string | null

  @Column(() => NotificationInterpolationDataFields)
  @Field(() => NotificationInterpolationDataFields, { nullable: true })
  interpolationData?: NotificationInterpolationDataFields | null

  @Column({ nullable: true })
  @Field(() => ID, { nullable: true })
  relatedOrderId?: string | null

  /**
   * @deprecated Prefer eventId. Kept for legacy rows and dual-write during transition.
   * Uniqueness is a partial index on string values only (see NotificationPersistenceService).
   * Do not use TypeORM `@Index({ unique: true, sparse: true })` — Mongo indexes explicit
   * nulls and blocks multi-recipient typed notifications that omit this field.
   */
  @Column({ nullable: true })
  deduplicationKey?: string | null

  /**
   * Idempotency key unique per recipient when present (string).
   * Partial unique index is ensured by NotificationPersistenceService —
   * do not add a TypeORM unique compound index (null eventId collides).
   */
  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  eventId?: string | null

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  sourceEntityType?: string | null

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  sourceEntityId?: string | null

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  actionPath?: string | null

  @Column(() => NotificationDeliveryState)
  @Field(() => NotificationDeliveryState, { nullable: true })
  deliveryState?: NotificationDeliveryState | null

  @Column({ nullable: true })
  @Field(() => Date, { nullable: true })
  expiresAt?: Date | null

  @Column({ nullable: true })
  @Field(() => Date, { nullable: true })
  readAt?: Date | null

  @CreateDateColumn()
  @Field()
  createdAt!: Date

  @Field()
  get read(): boolean {
    return this.readAt != null
  }
}
