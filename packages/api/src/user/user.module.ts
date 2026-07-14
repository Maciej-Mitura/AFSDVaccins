import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { RolesGuard } from './guards/roles.guard'
import { User } from './user.entity'
import { UserResolver } from './user.resolver'
import { UserService } from './user.service'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const userServiceProvider = isSchemaGeneration
  ? {
      provide: UserService,
      useValue: {
        normalizeEmail: (email: string) => email,
        normalizeName: (value: string) => value,
        findByFirebaseUid: () => Promise.resolve(null),
        requireByFirebaseUid: () =>
          Promise.reject(
            new Error('UserService is unavailable during schema generation'),
          ),
        createOwnUser: () => Promise.resolve(null),
        updateOwnUser: () => Promise.resolve(null),
      },
    }
  : UserService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([User])]

@Module({
  imports: [AuthenticationModule, ...persistenceImports],
  providers: [userServiceProvider, UserResolver, RolesGuard],
  exports: [UserService, RolesGuard],
})
export class UserModule {}
