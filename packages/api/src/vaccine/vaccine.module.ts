import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { VaccineCoreModule } from './vaccine-core.module'
import { VaccineResolver } from './vaccine.resolver'

@Module({
  imports: [AuthenticationModule, UserModule, VaccineCoreModule],
  providers: [VaccineResolver],
  exports: [VaccineCoreModule],
})
export class VaccineModule {}
