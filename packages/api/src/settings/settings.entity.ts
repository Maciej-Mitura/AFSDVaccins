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
  APPLICATION_SETTINGS_FIELD_DEFAULTS,
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

  @Column({ default: APPLICATION_SETTINGS_FIELD_DEFAULTS.timezone })
  @Field()
  timezone!: string

  @Column({ default: APPLICATION_SETTINGS_FIELD_DEFAULTS.orderingClosingTime })
  @Field()
  orderingClosingTime!: string

  @Column({ default: APPLICATION_SETTINGS_FIELD_DEFAULTS.weeklyWarningPercentage })
  @Field(() => Int)
  weeklyWarningPercentage!: number

  @Column({ default: APPLICATION_SETTINGS_FIELD_DEFAULTS.weeklyDoseCap })
  @Field(() => Int)
  weeklyDoseCap!: number

  @Column({ default: APPLICATION_SETTINGS_FIELD_DEFAULTS.dailyDoseCapPerType })
  @Field(() => Int)
  dailyDoseCapPerType!: number

  @CreateDateColumn()
  @Field()
  createdAt!: Date

  @UpdateDateColumn()
  @Field()
  updatedAt!: Date
}
