import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import {
  BezorgerProfileNotFoundException,
  ProfileForbiddenException,
  ProfileInvalidException,
} from '../exceptions/profile.exceptions'
import { BezorgerProfile } from './bezorger-profile.entity'
import {
  CompleteBezorgerProfileInput,
  UpdateOwnBezorgerProfileInput,
} from './dto/bezorger-profile.inputs'

@Injectable()
export class BezorgerProfileService {
  constructor(
    @InjectRepository(BezorgerProfile)
    private readonly profileRepository: MongoRepository<BezorgerProfile>,
  ) {}

  async findByUserId(userId: string): Promise<BezorgerProfile | null> {
    return this.profileRepository.findOne({
      where: { userId: userId.toString() },
    })
  }

  async findBezorgerProfileByUserId(
    userId: string,
  ): Promise<BezorgerProfile | null> {
    return this.findByUserId(userId)
  }

  async findBezorgerProfileById(id: string): Promise<BezorgerProfile> {
    const parsed = tryParseGraphqlObjectId(id)

    if (!parsed) {
      throw new BezorgerProfileNotFoundException()
    }

    const profile = await this.profileRepository.findOne({
      where: { _id: parsed.objectId },
    })

    if (!profile) {
      throw new BezorgerProfileNotFoundException()
    }

    return profile
  }

  async listBezorgerProfiles(): Promise<BezorgerProfile[]> {
    return this.profileRepository.find({
      order: { displayName: 'ASC' },
    })
  }

  async hasProfileForUser(userId: string): Promise<boolean> {
    const profile = await this.findByUserId(userId)
    return profile !== null
  }

  async completeOwnProfile(
    user: User,
    input: CompleteBezorgerProfileInput,
  ): Promise<BezorgerProfile> {
    this.assertBezorger(user)

    const existing = await this.findByUserId(user._id.toString())

    if (existing) {
      return existing
    }

    const displayName = input.displayName.trim()

    if (!displayName) {
      throw new ProfileInvalidException('displayName is required')
    }

    const vehicleLabel = this.normalizeOptionalLabel(input.vehicleLabel)

    const profile = this.profileRepository.create({
      userId: user._id.toString(),
      displayName,
      vehicleLabel,
    })

    try {
      return await this.profileRepository.save(profile)
    } catch {
      const raced = await this.findByUserId(user._id.toString())

      if (raced) {
        return raced
      }

      throw new ProfileInvalidException('Could not create bezorger profile')
    }
  }

  async updateOwnProfile(
    user: User,
    input: UpdateOwnBezorgerProfileInput,
  ): Promise<BezorgerProfile> {
    this.assertBezorger(user)

    const profile = await this.findByUserId(user._id.toString())

    if (!profile) {
      throw new BezorgerProfileNotFoundException()
    }

    if (input.displayName !== undefined) {
      const displayName = input.displayName.trim()

      if (!displayName) {
        throw new ProfileInvalidException('displayName is required')
      }

      profile.displayName = displayName
    }

    if (input.vehicleLabel !== undefined) {
      profile.vehicleLabel = this.normalizeOptionalLabel(input.vehicleLabel)
    }

    return this.profileRepository.save(profile)
  }

  async requireOwnProfile(user: User): Promise<BezorgerProfile> {
    this.assertBezorger(user)

    const profile = await this.findByUserId(user._id.toString())

    if (!profile) {
      throw new BezorgerProfileNotFoundException()
    }

    return profile
  }

  private normalizeOptionalLabel(
    value: string | null | undefined,
  ): string | null {
    if (value === undefined || value === null) {
      return null
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  private assertBezorger(user: User): void {
    if (user.role !== UserRole.BEZORGER) {
      throw new ProfileForbiddenException()
    }
  }
}
