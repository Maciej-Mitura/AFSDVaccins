import { CacheModule } from '@nestjs/cache-manager'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { EnvConfig } from '../../config/env.validation'
import { ApplicationCacheService } from './application-cache.service'

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        ttl: configService.get('CACHE_DEFAULT_TTL_MS', { infer: true }),
      }),
    }),
  ],
  providers: [ApplicationCacheService],
  exports: [ApplicationCacheService, CacheModule],
})
export class ApplicationCacheModule {}
