import { Field, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class HealthStatus {
  @Field()
  status!: string

  @Field()
  service!: string

  @Field()
  timestamp!: string

  @Field()
  environment!: string
}
