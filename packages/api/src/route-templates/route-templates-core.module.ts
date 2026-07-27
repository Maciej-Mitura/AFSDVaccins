import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ProfileCoreModule } from '../profile/profile-core.module'
import { RouteTemplate } from './route-template.entity'
import { RouteTemplatePersistenceService } from './route-template-persistence.service'
import { RouteTemplatesService } from './route-templates.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const routeTemplatesServiceProvider = isSchemaGeneration
  ? {
      provide: RouteTemplatesService,
      useValue: {
        createRouteTemplate: () => Promise.resolve(null),
        findRouteTemplates: () => Promise.resolve([]),
        findRouteTemplateById: () => Promise.resolve(null),
        findActiveTemplatesForBezorgerProfile: () => Promise.resolve([]),
        updateRouteTemplate: () => Promise.resolve(null),
        setRouteTemplateActive: () => Promise.resolve(null),
      },
    }
  : RouteTemplatesService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([RouteTemplate])]

const persistenceProviders = isSchemaGeneration
  ? []
  : [RouteTemplatePersistenceService]

@Module({
  imports: [ProfileCoreModule, ...persistenceImports],
  providers: [routeTemplatesServiceProvider, ...persistenceProviders],
  exports: [RouteTemplatesService, ...persistenceImports],
})
export class RouteTemplatesCoreModule {}
