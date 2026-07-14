import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { ApplicationSettings } from './settings.entity'
import { SettingsResolver } from './settings.resolver'
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
  imports: [AuthenticationModule, UserModule, ...persistenceImports],
  providers: [settingsServiceProvider, SettingsResolver],
  exports: [SettingsService],
})
export class SettingsModule {}
