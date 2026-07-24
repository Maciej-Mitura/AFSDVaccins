import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { RolesGuard } from './guards/roles.guard'
import { User } from './user.entity'
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
        findUserById: () => Promise.resolve(null),
        updateOwnUser: () => Promise.resolve(null),
        findUsersByRole: () => Promise.resolve([]),
      },
    }
  : UserService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([User])]

/**
 * Persistence + authorization helpers shared by the API and CLI bootstraps.
 * No GraphQL resolvers or HTTP/throttling guards.
 */
@Module({
  imports: [...persistenceImports],
  providers: [userServiceProvider, RolesGuard],
  exports: [
    UserService,
    RolesGuard,
    ...persistenceImports,
  ],
})
export class UserCoreModule {}
