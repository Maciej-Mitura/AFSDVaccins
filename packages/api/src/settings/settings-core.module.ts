import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ApplicationCacheModule } from '../common/cache/application-cache.module'
import { ApplicationSettings } from './settings.entity'
import { SettingsService } from './settings.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const settingsServiceProvider = isSchemaGeneration
  ? {
      provide: SettingsService,
      useValue: {
        getApplicationSettings: () => Promise.resolve(null),
        updateApplicationSettings: () => Promise.resolve(null),
      },
    }
  : SettingsService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([ApplicationSettings])]

@Module({
  imports: [ApplicationCacheModule, ...persistenceImports],
  providers: [settingsServiceProvider],
  exports: [SettingsService, TypeOrmModule],
})
export class SettingsCoreModule {}
