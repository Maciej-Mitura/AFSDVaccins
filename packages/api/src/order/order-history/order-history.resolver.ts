import { UseGuards } from '@nestjs/common'
import { Args, Query, Resolver } from '@nestjs/graphql'

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { CurrentUser } from '../../user/decorators/current-user.decorator'
import { Roles } from '../../user/decorators/roles.decorator'
import { RolesGuard } from '../../user/guards/roles.guard'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { OrderHistoryInput } from './order-history.input'
import { OrderHistoryService } from './order-history.service'
import { OrderHistoryConnection } from './order-history.types'

@Resolver()
export class OrderHistoryResolver {
  constructor(private readonly orderHistoryService: OrderHistoryService) {}

  @Query(() => OrderHistoryConnection, {
    description:
      'Paginated role-aware historical orders for ADMIN and APOTHEKER (Phase 35B2)',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.APOTHEKER)
  orderHistory(
    @CurrentUser() user: User,
    @Args('input') input: OrderHistoryInput,
  ): Promise<OrderHistoryConnection> {
    return this.orderHistoryService.findOrderHistory(user, input)
  }
}
