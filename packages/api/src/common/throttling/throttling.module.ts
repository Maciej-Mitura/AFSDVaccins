import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'

import { EnvConfig } from '../../config/env.validation'
import { GraphqlThrottlerGuard } from './graphql-throttler.guard'
import { StrictIdentityThrottlerGuard } from './strict-identity-throttler.guard'
import {
  THROTTLER_DEFAULT,
  THROTTLER_STRICT,
} from './throttling.constants'

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        throttlers: [
          {
            name: THROTTLER_DEFAULT,
            ttl: configService.get('THROTTLE_DEFAULT_TTL_MS', { infer: true }),
            limit: configService.get('THROTTLE_DEFAULT_LIMIT', { infer: true }),
          },
          {
            name: THROTTLER_STRICT,
            ttl: configService.get('THROTTLE_STRICT_TTL_MS', { infer: true }),
            limit: configService.get('THROTTLE_STRICT_LIMIT', { infer: true }),
          },
        ],
        // Avoid leaking rate-limit headers that could confuse GraphQL clients.
        setHeaders: false,
      }),
    }),
  ],
  providers: [
    GraphqlThrottlerGuard,
    StrictIdentityThrottlerGuard,
    {
      provide: APP_GUARD,
      useClass: GraphqlThrottlerGuard,
    },
  ],
  exports: [ThrottlerModule, StrictIdentityThrottlerGuard],
})
export class ThrottlingModule {}
