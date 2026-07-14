import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
  UpdateDateColumn,
} from 'typeorm'

import {
  DEFAULT_ORDERING_CLOSING_TIME,
  DEFAULT_TIMEZONE,
  DEFAULT_WEEKLY_WARNING_PERCENTAGE,
  SETTINGS_SINGLETON_KEY,
} from './settings.constants'

@Entity('application_settings')
@ObjectType('ApplicationSettings')
export class ApplicationSettings {
  @ObjectIdColumn()
  _id!: string

  @Field(() => ID)
  get id(): string {
    return this._id
  }

  @Index({ unique: true })
  @Column({ default: SETTINGS_SINGLETON_KEY })
  singletonKey!: string

  @Column({ default: DEFAULT_TIMEZONE })
  @Field()
  timezone!: string

  @Column({ default: DEFAULT_ORDERING_CLOSING_TIME })
  @Field()
  orderingClosingTime!: string

  @Column({ default: DEFAULT_WEEKLY_WARNING_PERCENTAGE })
  @Field(() => Int)
  weeklyWarningPercentage!: number

  @CreateDateColumn()
  @Field()
  createdAt!: Date

  @UpdateDateColumn()
  @Field()
  updatedAt!: Date
}
