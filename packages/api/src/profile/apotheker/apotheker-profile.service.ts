import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { normalizeAddress } from '../address.type'
import {
  ApothekerProfileNotFoundException,
  ProfileForbiddenException,
  ProfileInvalidException,
} from '../exceptions/profile.exceptions'
import { ApothekerProfile } from './apotheker-profile.entity'
import {
  CompleteApothekerProfileInput,
  UpdateOwnApothekerProfileInput,
} from './dto/apotheker-profile.inputs'

@Injectable()
export class ApothekerProfileService {
  constructor(
    @InjectRepository(ApothekerProfile)
    private readonly profileRepository: MongoRepository<ApothekerProfile>,
  ) {}

  async findByUserId(userId: string): Promise<ApothekerProfile | null> {
    return this.profileRepository.findOne({
      where: { userId: userId.toString() },
    })
  }

  async findApothekerProfileByUserId(
    userId: string,
  ): Promise<ApothekerProfile | null> {
    return this.findByUserId(userId)
  }

  async findApothekerProfileById(id: string): Promise<ApothekerProfile> {
    const parsed = tryParseGraphqlObjectId(id)

    if (!parsed) {
      throw new ApothekerProfileNotFoundException()
    }

    const profile = await this.profileRepository.findOne({
      where: { _id: parsed.objectId },
    })

    if (!profile) {
      throw new ApothekerProfileNotFoundException()
    }

    return profile
  }

  async listApothekerProfiles(): Promise<ApothekerProfile[]> {
    return this.profileRepository.find({
      order: { pharmacyName: 'ASC' },
    })
  }

  async hasProfileForUser(userId: string): Promise<boolean> {
    const profile = await this.findByUserId(userId)
    return profile !== null
  }

  async completeOwnProfile(
    user: User,
    input: CompleteApothekerProfileInput,
  ): Promise<ApothekerProfile> {
    this.assertApotheker(user)

    const existing = await this.findByUserId(user._id.toString())

    if (existing) {
      return existing
    }

    const pharmacyName = input.pharmacyName.trim()

    if (!pharmacyName) {
      throw new ProfileInvalidException('pharmacyName is required')
    }

    const address = normalizeAddress(input.address)

    const profile = this.profileRepository.create({
      userId: user._id.toString(),
      pharmacyName,
      address,
    })

    try {
      return await this.profileRepository.save(profile)
    } catch {
      const raced = await this.findByUserId(user._id.toString())

      if (raced) {
        return raced
      }

      throw new ProfileInvalidException('Could not create apotheker profile')
    }
  }

  async updateOwnProfile(
    user: User,
    input: UpdateOwnApothekerProfileInput,
  ): Promise<ApothekerProfile> {
    this.assertApotheker(user)

    const profile = await this.findByUserId(user._id.toString())

    if (!profile) {
      throw new ApothekerProfileNotFoundException()
    }

    if (input.pharmacyName !== undefined) {
      const pharmacyName = input.pharmacyName.trim()

      if (!pharmacyName) {
        throw new ProfileInvalidException('pharmacyName is required')
      }

      profile.pharmacyName = pharmacyName
    }

    if (input.address !== undefined) {
      profile.address = normalizeAddress(input.address)
    }

    return this.profileRepository.save(profile)
  }

  async requireOwnProfile(user: User): Promise<ApothekerProfile> {
    this.assertApotheker(user)

    const profile = await this.findByUserId(user._id.toString())

    if (!profile) {
      throw new ApothekerProfileNotFoundException()
    }

    return profile
  }

  private assertApotheker(user: User): void {
    if (user.role !== UserRole.APOTHEKER) {
      throw new ProfileForbiddenException()
    }
  }
}
