import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { tryParseGraphqlObjectId } from '../common/mongodb/graphql-object-id.util'
import {
  ApothekerProfileNotFoundException,
  BezorgerProfileNotFoundException,
} from '../profile/exceptions/profile.exceptions'
import { ApothekerProfileService } from '../profile/apotheker/apotheker-profile.service'
import { BezorgerProfileService } from '../profile/bezorger/bezorger-profile.service'
import { User } from '../user/user.entity'
import {
  CreateRouteTemplateInput,
  RouteTemplateStopInput,
  UpdateRouteTemplateInput,
} from './dto/route-template.inputs'
import {
  RouteTemplateAlreadyExistsException,
  RouteTemplateDuplicateStopException,
  RouteTemplateEmptyStopsException,
  RouteTemplateNotFoundException,
} from './exceptions/route-template.exceptions'
import { RouteTemplateStop } from './route-template-stop.embed'
import { RouteTemplate } from './route-template.entity'
import {
  normalizeRouteTemplateName,
  orderStopsBySequence,
} from './route-template.utils'

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  )
}

@Injectable()
export class RouteTemplatesService {
  constructor(
    @InjectRepository(RouteTemplate)
    private readonly routeTemplateRepository: MongoRepository<RouteTemplate>,
    private readonly bezorgerProfileService: BezorgerProfileService,
    private readonly apothekerProfileService: ApothekerProfileService,
  ) {}

  private async findByNormalizedName(
    normalizedName: string,
  ): Promise<RouteTemplate | null> {
    return this.routeTemplateRepository.findOne({
      where: { normalizedName },
    })
  }

  private async requireById(id: string): Promise<RouteTemplate> {
    const parsed = tryParseGraphqlObjectId(id)

    if (!parsed) {
      throw new RouteTemplateNotFoundException()
    }

    const template = await this.routeTemplateRepository.findOne({
      where: { _id: parsed.objectId },
    })

    if (!template) {
      throw new RouteTemplateNotFoundException()
    }

    return this.withOrderedStops(template)
  }

  private withOrderedStops(template: RouteTemplate): RouteTemplate {
    template.stops = orderStopsBySequence(template.stops ?? [])
    return template
  }

  private async assertUniqueName(
    normalizedName: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.findByNormalizedName(normalizedName)

    if (existing && existing._id.toString() !== excludeId) {
      throw new RouteTemplateAlreadyExistsException()
    }
  }

  private async requireBezorgerProfileId(
    bezorgerProfileId: string,
  ): Promise<string> {
    const parsed = tryParseGraphqlObjectId(bezorgerProfileId)

    if (!parsed) {
      throw new BezorgerProfileNotFoundException()
    }

    const profile =
      await this.bezorgerProfileService.findBezorgerProfileById(
        parsed.stringValue,
      )

    return profile._id.toString()
  }

  private async normalizeStops(
    stopInputs: RouteTemplateStopInput[],
  ): Promise<RouteTemplateStop[]> {
    if (stopInputs.length === 0) {
      throw new RouteTemplateEmptyStopsException()
    }

    const seen = new Set<string>()
    const stops: RouteTemplateStop[] = []

    for (const [index, stopInput] of stopInputs.entries()) {
      const parsed = tryParseGraphqlObjectId(stopInput.apothekerProfileId)

      if (!parsed) {
        throw new ApothekerProfileNotFoundException()
      }

      const profileId = parsed.stringValue

      if (seen.has(profileId)) {
        throw new RouteTemplateDuplicateStopException()
      }

      seen.add(profileId)

      await this.apothekerProfileService.findApothekerProfileById(profileId)

      stops.push({
        apothekerProfileId: profileId,
        sequence: index + 1,
      })
    }

    return stops
  }

  private normalizeDescription(
    description: string | null | undefined,
  ): string | null {
    if (description === undefined || description === null) {
      return null
    }

    const trimmed = description.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  async createRouteTemplate(
    input: CreateRouteTemplateInput,
    actor: User,
  ): Promise<RouteTemplate> {
    const name = input.name.trim()
    const normalizedName = normalizeRouteTemplateName(name)
    await this.assertUniqueName(normalizedName)

    const bezorgerProfileId = await this.requireBezorgerProfileId(
      input.bezorgerProfileId,
    )
    const stops = await this.normalizeStops(input.stops)
    const actorId = actor._id.toString()

    const template = this.routeTemplateRepository.create({
      name,
      normalizedName,
      description: this.normalizeDescription(input.description),
      active: true,
      bezorgerProfileId,
      stops,
      createdByUserId: actorId,
      updatedByUserId: actorId,
    })

    try {
      const saved = await this.routeTemplateRepository.save(template)
      return this.withOrderedStops(saved)
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new RouteTemplateAlreadyExistsException()
      }

      throw error
    }
  }

  async findRouteTemplates(includeInactive: boolean): Promise<RouteTemplate[]> {
    const templates = includeInactive
      ? await this.routeTemplateRepository.find({
          order: { name: 'ASC' },
        })
      : await this.routeTemplateRepository.find({
          where: { active: true },
          order: { name: 'ASC' },
        })

    return templates.map(template => this.withOrderedStops(template))
  }

  async findRouteTemplateById(id: string): Promise<RouteTemplate> {
    return this.requireById(id)
  }

  async updateRouteTemplate(
    id: string,
    input: UpdateRouteTemplateInput,
    actor: User,
  ): Promise<RouteTemplate> {
    const template = await this.requireById(id)

    if (input.name !== undefined) {
      const name = input.name.trim()
      const normalizedName = normalizeRouteTemplateName(name)
      await this.assertUniqueName(normalizedName, id)
      template.name = name
      template.normalizedName = normalizedName
    }

    if (input.description !== undefined) {
      template.description = this.normalizeDescription(input.description)
    }

    if (input.bezorgerProfileId !== undefined) {
      template.bezorgerProfileId = await this.requireBezorgerProfileId(
        input.bezorgerProfileId,
      )
    }

    if (input.stops !== undefined) {
      template.stops = await this.normalizeStops(input.stops)
    }

    template.updatedByUserId = actor._id.toString()

    try {
      const saved = await this.routeTemplateRepository.save(template)
      return this.withOrderedStops(saved)
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new RouteTemplateAlreadyExistsException()
      }

      throw error
    }
  }

  async setRouteTemplateActive(
    id: string,
    active: boolean,
    actor: User,
  ): Promise<RouteTemplate> {
    const template = await this.requireById(id)
    template.active = active
    template.updatedByUserId = actor._id.toString()
    const saved = await this.routeTemplateRepository.save(template)
    return this.withOrderedStops(saved)
  }
}
