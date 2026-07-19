import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { ProfileModule } from '../profile/profile.module'
import { UserModule } from '../user/user.module'
import { RouteTemplate } from './route-template.entity'
import { RouteTemplatesResolver } from './route-templates.resolver'
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

@Module({
  imports: [
    AuthenticationModule,
    UserModule,
    ProfileModule,
    ...persistenceImports,
  ],
  providers: [routeTemplatesServiceProvider, RouteTemplatesResolver],
  exports: [RouteTemplatesService],
})
export class RouteTemplatesModule {}
