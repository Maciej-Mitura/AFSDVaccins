import { Field, ID, ObjectType } from '@nestjs/graphql'

import { RouteStatus } from './route-status.enum'

@ObjectType('RouteStatusHistory')
export class RouteStatusHistoryEntry {
  @Field(() => RouteStatus, { nullable: true })
  fromStatus?: RouteStatus | null

  @Field(() => RouteStatus)
  toStatus!: RouteStatus

  @Field()
  changedAt!: Date

  @Field(() => ID)
  changedByUserId!: string

  @Field(() => String, { nullable: true })
  reason?: string | null
}
