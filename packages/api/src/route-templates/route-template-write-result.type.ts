import { Field, ID, ObjectType } from '@nestjs/graphql'

import { RouteTemplate } from './route-template.entity'

@ObjectType('RouteTemplateWriteResult')
export class RouteTemplateWriteResult {
  @Field(() => RouteTemplate)
  template!: RouteTemplate

  /**
   * Other active templates for the same courier that were deactivated in this
   * bounded write (never deleted). Empty when no conflict existed.
   */
  @Field(() => [ID])
  deactivatedTemplateIds!: string[]
}
