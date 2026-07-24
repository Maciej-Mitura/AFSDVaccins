import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserCoreModule } from './user-core.module'
import { UserResolver } from './user.resolver'

@Module({
  imports: [AuthenticationModule, UserCoreModule],
  providers: [UserResolver],
  exports: [UserCoreModule],
})
export class UserModule {}
