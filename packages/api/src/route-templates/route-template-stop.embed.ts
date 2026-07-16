import { Field, ID, Int, ObjectType } from '@nestjs/graphql'
import { Column } from 'typeorm'

@ObjectType('RouteTemplateStop')
export class RouteTemplateStop {
  @Column()
  @Field(() => ID)
  apothekerProfileId!: string

  @Column()
  @Field(() => Int)
  sequence!: number
}
