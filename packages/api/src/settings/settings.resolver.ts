import { UseGuards } from '@nestjs/common'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'

import { AuthorizationGuard } from '../authentication/authorization.guard'
import { StrictThrottle } from '../common/throttling/strict-rate-limit.decorator'
import { StrictIdentityThrottlerGuard } from '../common/throttling/strict-identity-throttler.guard'
import { Roles } from '../user/decorators/roles.decorator'
import { RolesGuard } from '../user/guards/roles.guard'
import { UserRole } from '../user/user-role.enum'
import { UpdateApplicationSettingsInput } from './dto/update-settings.input'
import { ApplicationSettings } from './settings.entity'
import { SettingsService } from './settings.service'

@Resolver(() => ApplicationSettings)
export class SettingsResolver {
  constructor(private readonly settingsService: SettingsService) {}

  @Query(() => ApplicationSettings, {
    description: 'Returns the singleton application settings record',
  })
  @UseGuards(AuthorizationGuard)
  applicationSettings(): Promise<ApplicationSettings> {
    return this.settingsService.getApplicationSettings()
  }

  @Mutation(() => ApplicationSettings, {
    description: 'Updates the singleton application settings record',
  })
  @UseGuards(AuthorizationGuard, RolesGuard, StrictIdentityThrottlerGuard)
  @StrictThrottle()
  @Roles(UserRole.ADMIN)
  updateApplicationSettings(
    @Args('input') input: UpdateApplicationSettingsInput,
  ): Promise<ApplicationSettings> {
    return this.settingsService.updateApplicationSettings(input)
  }
}
