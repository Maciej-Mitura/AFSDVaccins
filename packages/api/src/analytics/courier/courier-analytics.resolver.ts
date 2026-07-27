import { Args, Query, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { CourierPerformanceAnalytics } from './courier-analytics.graphql-types'
import { CourierAnalyticsService } from './courier-analytics.service'

@Resolver(() => CourierPerformanceAnalytics)
export class CourierAnalyticsResolver {
  constructor(private readonly analyticsService: CourierAnalyticsService) {}

  @Query(() => CourierPerformanceAnalytics, {
    description:
      'ADMIN-only all-time courier performance analytics (reliability scores, distributions, monthly activity). No date filters.',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async courierPerformanceAnalytics(
    @CurrentUser() user: User,
    @Args('refresh', {
      type: () => Boolean,
      nullable: true,
      defaultValue: false,
      description:
        'When true, bypasses the short server-side analytics cache and recalculates.',
    })
    refresh?: boolean,
  ): Promise<CourierPerformanceAnalytics> {
    return this.analyticsService.getCourierPerformanceAnalytics(user, {
      refresh: refresh === true,
    })
  }
}
