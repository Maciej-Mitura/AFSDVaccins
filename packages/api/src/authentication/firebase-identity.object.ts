import { Field, ObjectType } from '@nestjs/graphql'

@ObjectType('FirebaseIdentity')
export class FirebaseIdentity {
  @Field()
  uid!: string

  @Field({ nullable: true })
  email?: string

  @Field({ nullable: true })
  displayName?: string

  @Field()
  emailVerified!: boolean
}
