import { Module } from '@nestjs/common'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { VaccineImageModule } from './image/vaccine-image.module'
import { VaccineCoreModule } from './vaccine-core.module'
import { VaccineResolver } from './vaccine.resolver'

@Module({
  imports: [
    AuthenticationModule,
    UserModule,
    VaccineCoreModule,
    VaccineImageModule,
  ],
  providers: [VaccineResolver],
  exports: [VaccineCoreModule, VaccineImageModule],
})
export class VaccineModule {}
