import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ApothekerProfile } from './apotheker/apotheker-profile.entity'
import { ApothekerProfileService } from './apotheker/apotheker-profile.service'
import { BezorgerProfile } from './bezorger/bezorger-profile.entity'
import { BezorgerProfileService } from './bezorger/bezorger-profile.service'

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
  imports: [...persistenceImports],
  providers: [apothekerServiceProvider, bezorgerServiceProvider],
  exports: [
    ApothekerProfileService,
    BezorgerProfileService,
    ...persistenceImports,
  ],
})
export class ProfileCoreModule {}
