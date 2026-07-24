import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { OrderCoreModule } from './order-core.module'
import { OrderResolver } from './order.resolver'

@Module({
  imports: [AuthenticationModule, UserModule, OrderCoreModule],
  providers: [OrderResolver],
  exports: [OrderCoreModule],
})
export class OrderModule {}
