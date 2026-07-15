import { UseGuards } from '@nestjs/common'
import {
  Args,
  ID,
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
import { AdjustStockInput } from './dto/adjust-stock.input'
import { StockAdjustment } from './stock-adjustment.entity'
import { StockService } from './stock.service'

@Resolver(() => StockAdjustment)
export class StockResolver {
  constructor(
    private readonly stockService: StockService,
    private readonly userService: UserService,
  ) {}

  @Mutation(() => StockAdjustment, {
    description: 'Adjusts vaccine stock and records an immutable audit entry',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adjustVaccineStock(
    @CurrentUser() user: User,
    @Args('input') input: AdjustStockInput,
  ): Promise<StockAdjustment> {
    return this.stockService.adjustVaccineStock(user, input)
  }

  @Query(() => [StockAdjustment], {
    description: 'Returns stock adjustment audit records for administrators',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  stockAdjustments(
    @Args('vaccineId', { type: () => ID, nullable: true }) vaccineId?: string,
  ): Promise<StockAdjustment[]> {
    return this.stockService.findStockAdjustments(vaccineId)
  }

  @Query(() => [StockAdjustment], {
    description: 'Returns stock history for one vaccine',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  vaccineStockHistory(
    @Args('vaccineId', { type: () => ID }) vaccineId: string,
  ): Promise<StockAdjustment[]> {
    return this.stockService.findVaccineStockHistory(vaccineId)
  }

  @ResolveField(() => ID, {
    description: 'Vaccine affected by this stock adjustment',
  })
  vaccineId(@Parent() adjustment: StockAdjustment): string {
    return adjustment.vaccineObjectId.toString()
  }

  @ResolveField(() => User, {
    description: 'User who performed the stock adjustment',
  })
  async performedByUser(@Parent() adjustment: StockAdjustment): Promise<User> {
    return this.userService.findUserById(adjustment.performedByUserId)
  }
}
