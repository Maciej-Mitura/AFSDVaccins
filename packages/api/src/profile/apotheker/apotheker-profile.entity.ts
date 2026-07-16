import { Field, ID, ObjectType } from '@nestjs/graphql'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
  UpdateDateColumn,
} from 'typeorm'

import { Address } from '../address.type'

@Entity('apotheker_profiles')
@ObjectType('ApothekerProfile')
export class ApothekerProfile {
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
  pharmacyName!: string

  @Column()
  @Field(() => Address)
  address!: Address

  @CreateDateColumn()
  @Field()
  createdAt!: Date

  @UpdateDateColumn()
  @Field()
  updatedAt!: Date
}
