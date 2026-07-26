import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { NotificationsCoreModule } from './notifications-core.module'
import { NotificationsResolver } from './notifications.resolver'
import { NotificationScheduleModule } from './schedule/notification-schedule.module'

@Module({
  imports: [
    AuthenticationModule,
    UserModule,
    NotificationsCoreModule,
    NotificationScheduleModule,
  ],
  providers: [NotificationsResolver],
  exports: [NotificationsCoreModule, NotificationScheduleModule],
})
export class NotificationsModule {}
