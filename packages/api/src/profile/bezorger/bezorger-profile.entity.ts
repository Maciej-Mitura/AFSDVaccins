import { Field, ID, ObjectType } from '@nestjs/graphql'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('bezorger_profiles')
@ObjectType('BezorgerProfile')
export class BezorgerProfile {
  @ObjectIdColumn()
  _id!: string

  @Field(() => ID)
  get id(): string {
    return this._id
  }

  @Index({ unique: true })
  @Column()
  @Field(() => ID)
  userId!: string

  @Column()
  @Field()
  displayName!: string

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  vehicleLabel?: string | null

  @CreateDateColumn()
  @Field()
  createdAt!: Date

  @UpdateDateColumn()
  @Field()
  updatedAt!: Date
}
