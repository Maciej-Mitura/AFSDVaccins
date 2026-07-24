import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { StockCoreModule } from './stock-core.module'
import { StockResolver } from './stock.resolver'

@Module({
  imports: [AuthenticationModule, UserModule, StockCoreModule],
  providers: [StockResolver],
  exports: [StockCoreModule],
})
export class StockModule {}
