import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { ApothekerProfileResolver } from './apotheker/apotheker-profile.resolver'
import { BezorgerProfileResolver } from './bezorger/bezorger-profile.resolver'
import { ProfileCoreModule } from './profile-core.module'
import { UserProfileFieldsResolver } from './user-profile-fields.resolver'

@Module({
  imports: [AuthenticationModule, UserModule, ProfileCoreModule],
  providers: [
    ApothekerProfileResolver,
    BezorgerProfileResolver,
    UserProfileFieldsResolver,
  ],
  exports: [ProfileCoreModule],
})
export class ProfileModule {}
