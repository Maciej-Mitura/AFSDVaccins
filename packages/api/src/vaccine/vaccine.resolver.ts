import { UseGuards } from '@nestjs/common'
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql'

import { AuthorizationGuard } from '../authentication/authorization.guard'
import { StrictThrottle } from '../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../common/throttling/strict-identity-throttler.guard'
import { CurrentUser } from '../user/decorators/current-user.decorator'
import { Roles } from '../user/decorators/roles.decorator'
import { RolesGuard } from '../user/guards/roles.guard'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { CreateVaccineInput, UpdateVaccineInput } from './dto/vaccine.inputs'
import { Vaccine } from './vaccine.entity'
import { VaccineService } from './vaccine.service'

@Resolver(() => Vaccine)
export class VaccineResolver {
  constructor(private readonly vaccineService: VaccineService) {}

  @Query(() => [Vaccine], {
    description: 'Returns vaccines visible to the current user role',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.APOTHEKER, UserRole.BEZORGER)
  vaccines(
    @CurrentUser() user: User,
    @Args('includeInactive', { type: () => Boolean, defaultValue: false })
    includeInactive: boolean,
  ): Promise<Vaccine[]> {
    return this.vaccineService.findVaccines(includeInactive, user.role)
  }

  @Query(() => Vaccine, {
    description: 'Returns a single vaccine when visible to the current user',
  })
  @UseGuards(AuthorizationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.APOTHEKER, UserRole.BEZORGER)
  vaccine(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Vaccine> {
    return this.vaccineService.findVaccineById(id, user.role)
  }

  @Mutation(() => Vaccine, {
    description: 'Creates a vaccine in the catalogue',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.ADMIN)
  createVaccine(@Args('input') input: CreateVaccineInput): Promise<Vaccine> {
    return this.vaccineService.createVaccine(input)
  }

  @Mutation(() => Vaccine, {
    description: 'Updates an existing vaccine in the catalogue',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.ADMIN)
  updateVaccine(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateVaccineInput,
  ): Promise<Vaccine> {
    return this.vaccineService.updateVaccine(id, input)
  }

  @Mutation(() => Vaccine, {
    description: 'Activates or deactivates a vaccine',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.ADMIN)
  setVaccineActive(
    @Args('id', { type: () => ID }) id: string,
    @Args('active', { type: () => Boolean }) active: boolean,
  ): Promise<Vaccine> {
    return this.vaccineService.setVaccineActive(id, active)
  }
}
