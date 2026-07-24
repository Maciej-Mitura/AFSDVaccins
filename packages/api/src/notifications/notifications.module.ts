import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { NotificationsCoreModule } from './notifications-core.module'
import { NotificationsResolver } from './notifications.resolver'

@Module({
  imports: [AuthenticationModule, UserModule, NotificationsCoreModule],
  providers: [NotificationsResolver],
  exports: [NotificationsCoreModule],
})
export class NotificationsModule {}
