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

  @Mutation(() => RouteTemplate, {
    description: 'Creates a reusable delivery route template',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createRouteTemplate(
    @CurrentUser() user: User,
    @Args('input') input: CreateRouteTemplateInput,
  ): Promise<RouteTemplate> {
    return this.routeTemplatesService.createRouteTemplate(input, user)
  }

  @Mutation(() => RouteTemplate, {
    description: 'Updates an existing route template',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateRouteTemplate(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateRouteTemplateInput,
  ): Promise<RouteTemplate> {
    return this.routeTemplatesService.updateRouteTemplate(id, input, user)
  }

  @Mutation(() => RouteTemplate, {
    description: 'Activates or deactivates a route template',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  setRouteTemplateActive(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('active', { type: () => Boolean }) active: boolean,
  ): Promise<RouteTemplate> {
    return this.routeTemplatesService.setRouteTemplateActive(id, active, user)
  }
}
