import { Field, ID, ObjectType } from '@nestjs/graphql'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
  UpdateDateColumn,
} from 'typeorm'

import { UserRole } from './user-role.enum'

@Entity('users')
@ObjectType('User')
export class User {
  @ObjectIdColumn()
  _id!: string

  @Field(() => ID)
  get id(): string {
    return this._id
  }

  @Index({ unique: true })
  @Column()
  @Field()
  firebaseUid!: string

  @Column()
  @Field()
  email!: string

  @Column()
  @Field()
  firstName!: string

  @Column()
  @Field()
  lastName!: string

  @Column()
  @Field(() => UserRole)
  role!: UserRole

  @CreateDateColumn()
  @Field()
  createdAt!: Date

  @UpdateDateColumn()
  @Field()
  updatedAt!: Date
}
