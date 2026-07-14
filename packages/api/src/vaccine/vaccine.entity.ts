import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('vaccines')
@ObjectType('Vaccine')
export class Vaccine {
  @ObjectIdColumn()
  _id!: string

  @Field(() => ID)
  get id(): string {
    return this._id
  }

  @Column()
  @Field()
  name!: string

  @Index({ unique: true })
  @Column()
  normalizedName!: string

  @Column({ default: '' })
  @Field()
  description!: string

  @Column()
  @Field()
  manufacturer!: string

  @Column({ default: 0 })
  @Field(() => Int)
  stockQuantity!: number

  @Column({ default: 0 })
  @Field(() => Int)
  stockWarningThreshold!: number

  @Column({ default: true })
  @Field()
  active!: boolean

  @CreateDateColumn()
  @Field()
  createdAt!: Date

  @UpdateDateColumn()
  @Field()
  updatedAt!: Date
}
