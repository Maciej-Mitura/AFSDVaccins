import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import { Column } from 'typeorm'

@ObjectType('OrderLineSnapshot')
export class OrderLineSnapshot {
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
