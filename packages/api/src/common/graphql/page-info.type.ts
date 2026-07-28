import { Field, ObjectType } from '@nestjs/graphql'

/**
 * Forward-only Relay-style page info.
 * Shared across connection queries (order history, etc.).
 */
@ObjectType('PageInfo')
export class PageInfo {
  @Field()
  hasNextPage!: boolean

  @Field(() => String, { nullable: true })
  endCursor?: string | null
}
