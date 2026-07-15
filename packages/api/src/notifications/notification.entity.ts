import { Field, ID, ObjectType } from '@nestjs/graphql'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
} from 'typeorm'

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

  @Index()
  @Column()
  @Field(() => NotificationType)
  type!: NotificationType

  @Column()
  @Field()
  title!: string

  @Column()
  @Field()
  body!: string

  @Column({ nullable: true })
  @Field(() => ID, { nullable: true })
  relatedOrderId?: string | null

  @Index({ unique: true, sparse: true })
  @Column({ nullable: true })
  deduplicationKey?: string | null

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
