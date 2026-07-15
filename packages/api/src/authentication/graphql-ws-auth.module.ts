import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { GraphqlWsAuthService } from '../authentication/graphql-ws-auth.service'
import { UserModule } from '../user/user.module'

@Module({
  imports: [AuthenticationModule, UserModule],
  providers: [GraphqlWsAuthService],
  exports: [GraphqlWsAuthService],
})
export class GraphqlWsAuthModule {}
