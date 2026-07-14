import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import { Column } from 'typeorm'

@ObjectType('OrderLine')
export class OrderLine {
  @Column()
  @Field(() => ID)
  vaccineId!: string

  @Column()
  @Field()
  vaccineName!: string

  @Column()
  @Field()
  manufacturer!: string

  @Column()
  @Field(() => Int)
  quantity!: number
}
