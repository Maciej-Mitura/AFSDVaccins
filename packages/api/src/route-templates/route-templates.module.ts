import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { RouteTemplatesCoreModule } from './route-templates-core.module'
import { RouteTemplatesResolver } from './route-templates.resolver'

@Module({
  imports: [AuthenticationModule, UserModule, RouteTemplatesCoreModule],
  providers: [RouteTemplatesResolver],
  exports: [RouteTemplatesCoreModule],
})
export class RouteTemplatesModule {}
