import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthenticationModule } from '../authentication/authentication.module'
import { UserModule } from '../user/user.module'
import { ApothekerProfile } from './apotheker/apotheker-profile.entity'
import { ApothekerProfileResolver } from './apotheker/apotheker-profile.resolver'
import { ApothekerProfileService } from './apotheker/apotheker-profile.service'
import { BezorgerProfile } from './bezorger/bezorger-profile.entity'
import { BezorgerProfileResolver } from './bezorger/bezorger-profile.resolver'
import { BezorgerProfileService } from './bezorger/bezorger-profile.service'
import { UserProfileFieldsResolver } from './user-profile-fields.resolver'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const apothekerServiceProvider = isSchemaGeneration
  ? {
      provide: ApothekerProfileService,
      useValue: {
        findByUserId: () => Promise.resolve(null),
        findApothekerProfileByUserId: () => Promise.resolve(null),
        findApothekerProfileById: () =>
          Promise.reject(
            new Error(
              'ApothekerProfileService unavailable during schema generation',
            ),
          ),
        listApothekerProfiles: () => Promise.resolve([]),
        hasProfileForUser: () => Promise.resolve(false),
        completeOwnProfile: () => Promise.resolve(null),
        updateOwnProfile: () => Promise.resolve(null),
        requireOwnProfile: () =>
          Promise.reject(
            new Error(
              'ApothekerProfileService unavailable during schema generation',
            ),
          ),
      },
    }
  : ApothekerProfileService

const bezorgerServiceProvider = isSchemaGeneration
  ? {
      provide: BezorgerProfileService,
      useValue: {
        findByUserId: () => Promise.resolve(null),
        findBezorgerProfileByUserId: () => Promise.resolve(null),
        findBezorgerProfileById: () =>
          Promise.reject(
            new Error(
              'BezorgerProfileService unavailable during schema generation',
            ),
          ),
        listBezorgerProfiles: () => Promise.resolve([]),
        hasProfileForUser: () => Promise.resolve(false),
        completeOwnProfile: () => Promise.resolve(null),
        updateOwnProfile: () => Promise.resolve(null),
        requireOwnProfile: () =>
          Promise.reject(
            new Error(
              'BezorgerProfileService unavailable during schema generation',
            ),
          ),
      },
    }
  : BezorgerProfileService

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([ApothekerProfile, BezorgerProfile])]

@Module({
  imports: [AuthenticationModule, UserModule, ...persistenceImports],
  providers: [
    apothekerServiceProvider,
    bezorgerServiceProvider,
    ApothekerProfileResolver,
    BezorgerProfileResolver,
    UserProfileFieldsResolver,
  ],
  exports: [ApothekerProfileService, BezorgerProfileService],
})
export class ProfileModule {}
