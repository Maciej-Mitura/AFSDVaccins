import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { Order } from '../order/order.entity'
import { OrderModule } from '../order/order.module'
import { ApothekerProfile } from '../profile/apotheker/apotheker-profile.entity'
import { BezorgerProfile } from '../profile/bezorger/bezorger-profile.entity'
import { ProfileModule } from '../profile/profile.module'
import { RouteTemplate } from '../route-templates/route-template.entity'
import { RouteTemplatesModule } from '../route-templates/route-templates.module'
import { RoutesModule } from '../routes/routes.module'
import { ApplicationSettings } from '../settings/settings.entity'
import { SettingsModule } from '../settings/settings.module'
import { StockModule } from '../stock/stock.module'
import { User } from '../user/user.entity'
import { UserModule } from '../user/user.module'
import { Vaccine } from '../vaccine/vaccine.entity'
import { VaccineModule } from '../vaccine/vaccine.module'
import { SeedFirebaseProvisioningService } from './seed-firebase-provisioning.service'
import { SeedSafetyService } from './seed.safety'
import { SeedService } from './seed.service'

@Module({
  imports: [
    AuthenticationModule,
    UserModule,
    ProfileModule,
    SettingsModule,
    VaccineModule,
    StockModule,
    OrderModule,
    RouteTemplatesModule,
    RoutesModule,
    TypeOrmModule.forFeature([
      User,
      ApothekerProfile,
      BezorgerProfile,
      ApplicationSettings,
      Vaccine,
      Order,
      RouteTemplate,
    ]),
  ],
  providers: [
    SeedSafetyService,
    SeedFirebaseProvisioningService,
    SeedService,
  ],
  exports: [SeedService, SeedSafetyService],
})
export class SeedModule {}
