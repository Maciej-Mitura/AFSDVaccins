import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { ApplicationCacheModule } from '../common/cache/application-cache.module'
import { PubSubModule } from '../common/pubsub/pubsub.module'
import { Order } from '../order/order.entity'
import { ApothekerProfile } from '../profile/apotheker/apotheker-profile.entity'
import { BezorgerProfile } from '../profile/bezorger/bezorger-profile.entity'
import { RouteTemplate } from '../route-templates/route-template.entity'
import { RoutesCoreModule } from '../routes/routes-core.module'
import { ApplicationSettings } from '../settings/settings.entity'
import { SettingsCoreModule } from '../settings/settings-core.module'
import { StockCoreModule } from '../stock/stock-core.module'
import { User } from '../user/user.entity'
import { Vaccine } from '../vaccine/vaccine.entity'
import { SeedFirebaseProvisioningService } from './seed-firebase-provisioning.service'
import { BootstrapSafetyService } from './bootstrap.safety'
import { SeedSafetyService } from './seed.safety'
import { SeedService } from './seed.service'

/**
 * CLI seed/bootstrap graph: persistence cores only — no GraphQL resolvers,
 * StrictIdentityThrottlerGuard, or other HTTP-only providers.
 */
@Module({
  imports: [
    AuthenticationModule,
    ApplicationCacheModule,
    PubSubModule,
    SettingsCoreModule,
    StockCoreModule,
    RoutesCoreModule,
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
    BootstrapSafetyService,
    SeedFirebaseProvisioningService,
    SeedService,
  ],
  exports: [SeedService, SeedSafetyService, BootstrapSafetyService],
})
export class SeedModule {}
