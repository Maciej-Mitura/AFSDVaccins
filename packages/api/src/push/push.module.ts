import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { PushCoreModule } from './push-core.module'
import { PushSubscriptionResolver } from './push-subscription.resolver'

/**
 * HTTP/GraphQL push surface on top of PushCoreModule.
 */
@Module({
  imports: [AuthenticationModule, UserModule, PushCoreModule],
  providers: [PushSubscriptionResolver],
  exports: [PushCoreModule],
})
export class PushModule {}
