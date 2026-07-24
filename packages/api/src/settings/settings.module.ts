import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { SettingsCoreModule } from './settings-core.module'
import { SettingsResolver } from './settings.resolver'

@Module({
  imports: [AuthenticationModule, UserModule, SettingsCoreModule],
  providers: [SettingsResolver],
  exports: [SettingsCoreModule],
})
export class SettingsModule {}
