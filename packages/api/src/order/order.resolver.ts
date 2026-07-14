import { UseGuards } from '@nestjs/common'
import {
  Args,
  ID,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql'

import { AuthorizationGuard } from '../authentication/authorization.guard'
import { CurrentUser } from '../user/decorators/current-user.decorator'
import { Roles } from '../user/decorators/roles.decorator'
import { RolesGuard } from '../user/guards/roles.guard'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { UserService } from '../user/user.service'
import { CreateOrderInput } from './dto/create-order.input'
import { OrderFilterInput } from './dto/order-filter.input'
import { Order } from './order.entity'
import { OrderStatus } from './order-status.enum'
import { OrderService } from './order.service'
import { WeeklyOrderSummary } from './weekly-order-summary.type'

@Resolver(() => Order)
export class OrderResolver {
  constructor(
    private readonly orderService: OrderService,
    private readonly userService: UserService,
  ) {}

  @Mutation(() => Order, {
    description: 'Creates a vaccine order for the authenticated apotheker',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER)
  createOrder(
    @CurrentUser() user: User,
    @Args('input') input: CreateOrderInput,
  ): Promise<Order> {
    return this.orderService.createOrder(user, input)
  }

  @Query(() => [Order], {
    description: 'Returns orders for the authenticated apotheker',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER)
  myOrders(
    @CurrentUser() user: User,
    @Args('isoYear', { type: () => Int, nullable: true }) isoYear?: number,
    @Args('isoWeek', { type: () => Int, nullable: true }) isoWeek?: number,
  ): Promise<Order[]> {
    return this.orderService.findMyOrders(user, isoYear, isoWeek)
  }

  @Query(() => Order, {
    description: 'Returns one order owned by the authenticated apotheker',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER)
  myOrder(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Order> {
    return this.orderService.findMyOrder(user, id)
  }

  @Query(() => WeeklyOrderSummary, {
    description: 'Returns weekly order usage for the authenticated apotheker',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER)
  myWeeklyOrderSummary(
    @CurrentUser() user: User,
    @Args('isoYear', { type: () => Int, nullable: true }) isoYear?: number,
    @Args('isoWeek', { type: () => Int, nullable: true }) isoWeek?: number,
  ): Promise<WeeklyOrderSummary> {
    return this.orderService.findMyWeeklyOrderSummary(user, isoYear, isoWeek)
  }

  @Mutation(() => Order, {
    description: 'Cancels an eligible order owned by the authenticated apotheker',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER)
  cancelOwnOrder(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Order> {
    return this.orderService.cancelOwnOrder(user, id)
  }

  @Query(() => [Order], {
    description: 'Returns all orders for administrative overview',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  orders(
    @Args('isoYear', { type: () => Int, nullable: true }) isoYear?: number,
    @Args('isoWeek', { type: () => Int, nullable: true }) isoWeek?: number,
    @Args('status', { type: () => OrderStatus, nullable: true })
    status?: OrderStatus,
    @Args('apothekerId', { type: () => ID, nullable: true })
    apothekerId?: string,
  ): Promise<Order[]> {
    const filter: OrderFilterInput = {
      isoYear,
      isoWeek,
      status,
      apothekerId,
    }

    return this.orderService.findOrders(filter)
  }

  @Query(() => Order, {
    description: 'Returns one order for administrative inspection',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  order(@Args('id', { type: () => ID }) id: string): Promise<Order> {
    return this.orderService.findOrderById(id)
  }

  @ResolveField(() => User, {
    description: 'Pharmacist who placed the order',
  })
  apotheker(@Parent() order: Order): Promise<User> {
    return this.userService.findUserById(order.apothekerId.toString())
  }
}
