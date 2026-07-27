import { UseGuards } from '@nestjs/common'
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql'

import { AuthorizationGuard } from '../authentication/authorization.guard'
import { CurrentUser } from '../user/decorators/current-user.decorator'
import { Roles } from '../user/decorators/roles.decorator'
import { RolesGuard } from '../user/guards/roles.guard'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import {
  CreateRouteTemplateInput,
  UpdateRouteTemplateInput,
} from './dto/route-template.inputs'
import { RouteTemplate } from './route-template.entity'
import { RouteTemplateWriteResult } from './route-template-write-result.type'
import { RouteTemplatesService } from './route-templates.service'

@Resolver(() => RouteTemplate)
export class RouteTemplatesResolver {
  constructor(private readonly routeTemplatesService: RouteTemplatesService) {}

  @Query(() => [RouteTemplate], {
    description: 'Returns route templates (active by default)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  routeTemplates(
    @Args('includeInactive', { type: () => Boolean, defaultValue: false })
    includeInactive: boolean,
  ): Promise<RouteTemplate[]> {
    return this.routeTemplatesService.findRouteTemplates(includeInactive)
  }

  @Query(() => RouteTemplate, {
    description: 'Returns a single route template by id',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  routeTemplate(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<RouteTemplate> {
    return this.routeTemplatesService.findRouteTemplateById(id)
  }

  @Mutation(() => RouteTemplateWriteResult, {
    description:
      'Creates an active delivery route template; deactivates any prior active template for the same courier',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createRouteTemplate(
    @CurrentUser() user: User,
    @Args('input') input: CreateRouteTemplateInput,
  ): Promise<RouteTemplateWriteResult> {
    return this.routeTemplatesService.createRouteTemplate(input, user)
  }

  @Mutation(() => RouteTemplateWriteResult, {
    description:
      'Updates an existing route template; reassignment of an active template deactivates conflicts on the target courier',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateRouteTemplate(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateRouteTemplateInput,
  ): Promise<RouteTemplateWriteResult> {
    return this.routeTemplatesService.updateRouteTemplate(id, input, user)
  }

  @Mutation(() => RouteTemplateWriteResult, {
    description:
      'Activates or deactivates a route template; activation deactivates any other active template for the same courier',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  setRouteTemplateActive(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('active', { type: () => Boolean }) active: boolean,
  ): Promise<RouteTemplateWriteResult> {
    return this.routeTemplatesService.setRouteTemplateActive(id, active, user)
  }
}
