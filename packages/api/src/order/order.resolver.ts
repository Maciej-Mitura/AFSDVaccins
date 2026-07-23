import { UseGuards, Inject } from '@nestjs/common'
import {
  Args,
  ID,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
  Subscription,
} from '@nestjs/graphql'
import { PubSub } from 'graphql-subscriptions'

import { AuthorizationGuard } from '../authentication/authorization.guard'
import {
  ADMIN_OPERATIONS_FEED_EVENT,
  ORDER_CREATED_EVENT,
  ORDER_UPDATED_EVENT,
  PUB_SUB,
} from '../common/pubsub/pubsub.constants'
import { StrictThrottle } from '../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../user/decorators/current-user.decorator'
import { Roles } from '../user/decorators/roles.decorator'
import { RolesGuard } from '../user/guards/roles.guard'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { UserService } from '../user/user.service'
import { AdminDailyOrderOverview } from './admin-daily-order-overview.type'
import { AdminOperationsFeedEvent } from './admin-operations-feed.type'
import { filterAdminOperationsFeedEvent } from './admin-operations-feed.filter'
import { AdminWeeklyStatistics } from './admin-weekly-statistics.type'
import { CreateOrderInput } from './dto/create-order.input'
import {
  filterOrderCreatedEvent,
  filterOrderUpdatedEvent,
} from './order-subscription.filter'
import { Order } from './order.entity'
import { OrderStatus } from './order-status.enum'
import { OrderService } from './order.service'
import { WeeklyOrderSummary } from './weekly-order-summary.type'

@Resolver(() => Order)
export class OrderResolver {
  constructor(
    private readonly orderService: OrderService,
    private readonly userService: UserService,
    @Inject(PUB_SUB) private readonly pubSub: PubSub,
  ) {}

  @Mutation(() => Order, {
    description: 'Creates a vaccine order for the authenticated apotheker',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
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
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.APOTHEKER)
  cancelOwnOrder(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Order> {
    return this.orderService.cancelOwnOrder(user, id)
  }

  @Query(() => [Order], {
    description: 'Returns all orders for administrative overview',
    name: 'orders',
    deprecationReason: 'Use adminOrders instead',
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
    return this.orderService.findOrders({
      isoYear,
      isoWeek,
      status,
      apothekerId,
    })
  }

  @Query(() => [Order], {
    description: 'Returns filtered orders for administrative management',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminOrders(
    @Args('deliveryDate', { nullable: true }) deliveryDate?: string,
    @Args('isoYear', { type: () => Int, nullable: true }) isoYear?: number,
    @Args('isoWeek', { type: () => Int, nullable: true }) isoWeek?: number,
    @Args('status', { type: () => OrderStatus, nullable: true })
    status?: OrderStatus,
    @Args('apothekerId', { type: () => ID, nullable: true })
    apothekerId?: string,
  ): Promise<Order[]> {
    return this.orderService.findOrders({
      deliveryDate,
      isoYear,
      isoWeek,
      status,
      apothekerId,
    })
  }

  @Query(() => AdminDailyOrderOverview, {
    description: 'Returns aggregated order overview for a delivery date',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminDailyOrderOverview(
    @Args('deliveryDate') deliveryDate: string,
  ): Promise<AdminDailyOrderOverview> {
    return this.orderService.getAdminDailyOrderOverview(deliveryDate)
  }

  @Query(() => AdminWeeklyStatistics, {
    description: 'Returns aggregated weekly order statistics',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminWeeklyStatistics(
    @Args('isoYear', { type: () => Int }) isoYear: number,
    @Args('isoWeek', { type: () => Int }) isoWeek: number,
  ): Promise<AdminWeeklyStatistics> {
    return this.orderService.getAdminWeeklyStatistics(isoYear, isoWeek)
  }

  @Query(() => Order, {
    description: 'Returns one order for administrative inspection',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  order(@Args('id', { type: () => ID }) id: string): Promise<Order> {
    return this.orderService.findOrderById(id)
  }

  @Mutation(() => Order, {
    description: 'Updates order status according to the admin state machine',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateOrderStatus(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('status', { type: () => OrderStatus }) status: OrderStatus,
    @Args('reason', { nullable: true }) reason?: string,
  ): Promise<Order> {
    return this.orderService.updateOrderStatus(user, id, status, reason)
  }

  @Mutation(() => Order, {
    description: 'Cancels an eligible order as administrator',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  cancelOrder(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
    @Args('reason', { nullable: true }) reason?: string,
  ): Promise<Order> {
    return this.orderService.cancelOrder(user, id, reason)
  }

  @Subscription(() => Order, {
    description: 'Live order-created events filtered by role and ownership',
    filter: filterOrderCreatedEvent,
    resolve: (payload: { orderCreated: Order }) => payload.orderCreated,
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN)
  orderCreated() {
    return this.pubSub.asyncIterableIterator(ORDER_CREATED_EVENT)
  }

  @Subscription(() => Order, {
    description: 'Live order-updated events filtered by role and ownership',
    filter: filterOrderUpdatedEvent,
    resolve: (payload: { orderUpdated: Order }) => payload.orderUpdated,
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.APOTHEKER, UserRole.ADMIN)
  orderUpdated() {
    return this.pubSub.asyncIterableIterator(ORDER_UPDATED_EVENT)
  }

  @Subscription(() => AdminOperationsFeedEvent, {
    description: 'Live operational events for administrators',
    filter: filterAdminOperationsFeedEvent,
    resolve: (payload: { adminOperationsFeed: AdminOperationsFeedEvent }) =>
      payload.adminOperationsFeed,
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminOperationsFeed() {
    return this.pubSub.asyncIterableIterator(ADMIN_OPERATIONS_FEED_EVENT)
  }

  @ResolveField(() => User, {
    description: 'Pharmacist who placed the order',
  })
  apotheker(@Parent() order: Order): Promise<User> {
    return this.userService.findUserById(order.apothekerId.toString())
  }
}
