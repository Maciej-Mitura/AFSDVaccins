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
  RouteTemplateActiveOwnerConflictException,
  RouteTemplateAlreadyExistsException,
  RouteTemplateDuplicateStopException,
  RouteTemplateEmptyStopsException,
  RouteTemplateNotFoundException,
} from './exceptions/route-template.exceptions'
import { RouteTemplateStop } from './route-template-stop.embed'
import { RouteTemplate } from './route-template.entity'
import { RouteTemplateWriteResult } from './route-template-write-result.type'
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

function duplicateKeyField(error: unknown): string | null {
  if (!isDuplicateKeyError(error)) {
    return null
  }

  const keyPattern = (error as { keyPattern?: Record<string, unknown> })
    .keyPattern
  if (keyPattern && typeof keyPattern === 'object') {
    const keys = Object.keys(keyPattern)
    if (keys.length > 0) {
      return keys[0]
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('bezorgerProfileId')) {
    return 'bezorgerProfileId'
  }
  if (message.includes('normalizedName')) {
    return 'normalizedName'
  }

  return null
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

  /**
   * Domain invariant: at most one active template per bezorgerProfileId.
   * Deactivates siblings in the same bounded write; never deletes history.
   */
  async deactivateOtherActiveTemplatesForCourier(params: {
    bezorgerProfileId: string
    keepTemplateId: string
    actorUserId: string
  }): Promise<string[]> {
    const keepParsed = tryParseGraphqlObjectId(params.keepTemplateId)
    if (!keepParsed) {
      return []
    }

    const siblings = await this.routeTemplateRepository.find({
      where: {
        bezorgerProfileId: params.bezorgerProfileId,
        active: true,
      },
    })

    const deactivatedIds: string[] = []
    const now = new Date()

    for (const sibling of siblings) {
      const siblingId = sibling._id.toString()
      if (siblingId === keepParsed.stringValue) {
        continue
      }

      sibling.active = false
      sibling.updatedByUserId = params.actorUserId
      sibling.updatedAt = now
      await this.routeTemplateRepository.save(sibling)
      deactivatedIds.push(siblingId)
    }

    return deactivatedIds
  }

  private mapSaveDuplicateKey(error: unknown): never {
    const field = duplicateKeyField(error)
    if (field === 'bezorgerProfileId') {
      throw new RouteTemplateActiveOwnerConflictException()
    }
    throw new RouteTemplateAlreadyExistsException()
  }

  async createRouteTemplate(
    input: CreateRouteTemplateInput,
    actor: User,
  ): Promise<RouteTemplateWriteResult> {
    const name = input.name.trim()
    const normalizedName = normalizeRouteTemplateName(name)
    await this.assertUniqueName(normalizedName)

    const bezorgerProfileId = await this.requireBezorgerProfileId(
      input.bezorgerProfileId,
    )
    const stops = await this.normalizeStops(input.stops)
    const actorId = actor._id.toString()

    // Deactivate existing actives first so the new template can claim the
    // partial unique active-owner slot (never delete historical rows).
    const priorActive =
      await this.findActiveTemplatesForBezorgerProfile(bezorgerProfileId)
    const deactivatedTemplateIds: string[] = []
    for (const existing of priorActive) {
      existing.active = false
      existing.updatedByUserId = actorId
      await this.routeTemplateRepository.save(existing)
      deactivatedTemplateIds.push(existing._id.toString())
    }

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

    let saved: RouteTemplate
    try {
      saved = await this.routeTemplateRepository.save(template)
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        // Concurrent create race: clear actives again and retry once.
        const field = duplicateKeyField(error)
        if (field === 'bezorgerProfileId') {
          const racedPrior =
            await this.findActiveTemplatesForBezorgerProfile(bezorgerProfileId)
          for (const existing of racedPrior) {
            existing.active = false
            existing.updatedByUserId = actorId
            await this.routeTemplateRepository.save(existing)
            deactivatedTemplateIds.push(existing._id.toString())
          }
          try {
            saved = await this.routeTemplateRepository.save(template)
          } catch (retryError) {
            if (isDuplicateKeyError(retryError)) {
              this.mapSaveDuplicateKey(retryError)
            }
            throw retryError
          }
        } else {
          this.mapSaveDuplicateKey(error)
        }
      } else {
        throw error
      }
    }

    const racedAfterInsert =
      await this.deactivateOtherActiveTemplatesForCourier({
        bezorgerProfileId,
        keepTemplateId: saved._id.toString(),
        actorUserId: actorId,
      })

    return {
      template: this.withOrderedStops(saved),
      deactivatedTemplateIds: [
        ...new Set([...deactivatedTemplateIds, ...racedAfterInsert]),
      ],
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

  async findActiveTemplatesForBezorgerProfile(
    bezorgerProfileId: string,
  ): Promise<RouteTemplate[]> {
    const parsed = tryParseGraphqlObjectId(bezorgerProfileId)

    if (!parsed) {
      return []
    }

    const templates = await this.routeTemplateRepository.find({
      where: {
        bezorgerProfileId: parsed.stringValue,
        active: true,
      },
      order: { name: 'ASC' },
    })

    return templates.map(template => this.withOrderedStops(template))
  }

  async updateRouteTemplate(
    id: string,
    input: UpdateRouteTemplateInput,
    actor: User,
  ): Promise<RouteTemplateWriteResult> {
    const template = await this.requireById(id)
    const actorId = actor._id.toString()
    let ownershipChanged = false

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
      const nextBezorgerProfileId = await this.requireBezorgerProfileId(
        input.bezorgerProfileId,
      )
      if (nextBezorgerProfileId !== template.bezorgerProfileId) {
        ownershipChanged = true
      }
      template.bezorgerProfileId = nextBezorgerProfileId
    }

    if (input.stops !== undefined) {
      template.stops = await this.normalizeStops(input.stops)
    }

    template.updatedByUserId = actorId

    let deactivatedTemplateIds: string[] = []
    if (template.active && ownershipChanged) {
      deactivatedTemplateIds =
        await this.deactivateOtherActiveTemplatesForCourier({
          bezorgerProfileId: template.bezorgerProfileId,
          keepTemplateId: template._id.toString(),
          actorUserId: actorId,
        })
    }

    let saved: RouteTemplate
    try {
      saved = await this.routeTemplateRepository.save(template)
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        this.mapSaveDuplicateKey(error)
      }
      throw error
    }

    return {
      template: this.withOrderedStops(saved),
      deactivatedTemplateIds,
    }
  }

  async setRouteTemplateActive(
    id: string,
    active: boolean,
    actor: User,
  ): Promise<RouteTemplateWriteResult> {
    const template = await this.requireById(id)
    const actorId = actor._id.toString()
    let deactivatedTemplateIds: string[] = []

    if (active) {
      deactivatedTemplateIds =
        await this.deactivateOtherActiveTemplatesForCourier({
          bezorgerProfileId: template.bezorgerProfileId,
          keepTemplateId: template._id.toString(),
          actorUserId: actorId,
        })
    }

    template.active = active
    template.updatedByUserId = actorId

    let saved: RouteTemplate
    try {
      saved = await this.routeTemplateRepository.save(template)
    } catch (error) {
      if (isDuplicateKeyError(error) && active) {
        // Concurrent activation race: retry once after another deactivation pass.
        deactivatedTemplateIds = [
          ...deactivatedTemplateIds,
          ...(await this.deactivateOtherActiveTemplatesForCourier({
            bezorgerProfileId: template.bezorgerProfileId,
            keepTemplateId: template._id.toString(),
            actorUserId: actorId,
          })),
        ]
        try {
          saved = await this.routeTemplateRepository.save(template)
        } catch (retryError) {
          if (isDuplicateKeyError(retryError)) {
            throw new RouteTemplateActiveOwnerConflictException()
          }
          throw retryError
        }
      } else if (isDuplicateKeyError(error)) {
        this.mapSaveDuplicateKey(error)
      } else {
        throw error
      }
    }

    return {
      template: this.withOrderedStops(saved),
      deactivatedTemplateIds: [...new Set(deactivatedTemplateIds)],
    }
  }

  async countActiveTemplatesForCourier(
    bezorgerProfileId: string,
  ): Promise<number> {
    const parsed = tryParseGraphqlObjectId(bezorgerProfileId)
    if (!parsed) {
      return 0
    }

    return this.routeTemplateRepository.count({
      where: {
        bezorgerProfileId: parsed.stringValue,
        active: true,
      },
    })
  }
}
