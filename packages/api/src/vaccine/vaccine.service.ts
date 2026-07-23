import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { ApplicationCacheService } from '../common/cache/application-cache.service'
import { CacheKeys } from '../common/cache/cache-keys'
import { tryParseGraphqlObjectId } from '../common/mongodb/graphql-object-id.util'
import { UserRole } from '../user/user-role.enum'
import { CreateVaccineInput, UpdateVaccineInput } from './dto/vaccine.inputs'
import {
  VaccineAlreadyExistsException,
  VaccineNotFoundException,
} from './exceptions/vaccine.exceptions'
import { Vaccine } from './vaccine.entity'
import { normalizeVaccineName } from './vaccine.utils'

@Injectable()
export class VaccineService {
  constructor(
    @InjectRepository(Vaccine)
    private readonly vaccineRepository: MongoRepository<Vaccine>,
    private readonly applicationCache: ApplicationCacheService,
  ) {}

  private async findByNormalizedName(
    normalizedName: string,
  ): Promise<Vaccine | null> {
    return this.vaccineRepository.findOne({
      where: { normalizedName },
    })
  }

  private async requireById(id: string): Promise<Vaccine> {
    const parsed = tryParseGraphqlObjectId(id)

    if (!parsed) {
      throw new VaccineNotFoundException()
    }

    const vaccine = await this.vaccineRepository.findOne({
      where: { _id: parsed.objectId },
    })

    if (!vaccine) {
      throw new VaccineNotFoundException()
    }

    return vaccine
  }

  private async assertUniqueName(
    normalizedName: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.findByNormalizedName(normalizedName)

    if (existing && existing._id.toString() !== excludeId) {
      throw new VaccineAlreadyExistsException()
    }
  }

  private async loadActiveVaccinesFromDb(): Promise<Vaccine[]> {
    return this.vaccineRepository.find({
      where: { active: true },
      order: { name: 'ASC' },
    })
  }

  private async loadAllVaccinesFromDb(): Promise<Vaccine[]> {
    return this.vaccineRepository.find({
      order: { name: 'ASC' },
    })
  }

  async createVaccine(input: CreateVaccineInput): Promise<Vaccine> {
    const normalizedName = normalizeVaccineName(input.name)
    await this.assertUniqueName(normalizedName)

    const vaccine = this.vaccineRepository.create({
      name: input.name.trim(),
      normalizedName,
      description: input.description?.trim() ?? '',
      manufacturer: input.manufacturer.trim(),
      stockQuantity: 0,
      stockWarningThreshold: input.stockWarningThreshold ?? 0,
      active: input.active ?? true,
    })

    try {
      const saved = await this.vaccineRepository.save(vaccine)
      await this.applicationCache.invalidateVaccines()
      return saved
    } catch {
      throw new VaccineAlreadyExistsException()
    }
  }

  /**
   * Catalogue reads:
   * - non-ADMIN always use `vaccines:active` (inactive never shared to them)
   * - ADMIN + includeInactive use `vaccines:all` (only after ADMIN authz)
   * - ADMIN without includeInactive also use `vaccines:active`
   */
  async findVaccines(
    includeInactive: boolean,
    role: UserRole,
  ): Promise<Vaccine[]> {
    const canIncludeInactive = role === UserRole.ADMIN && includeInactive

    if (canIncludeInactive) {
      return this.applicationCache.getOrSet(
        CacheKeys.vaccinesAll(),
        () => this.loadAllVaccinesFromDb(),
        this.applicationCache.referenceTtlMs(),
      )
    }

    return this.applicationCache.getOrSet(
      CacheKeys.vaccinesActive(),
      () => this.loadActiveVaccinesFromDb(),
      this.applicationCache.referenceTtlMs(),
    )
  }

  async findVaccineEntityById(id: string): Promise<Vaccine> {
    return this.requireById(id)
  }

  async findVaccineById(id: string, role: UserRole): Promise<Vaccine> {
    const vaccine = await this.requireById(id)

    if (!vaccine.active && role !== UserRole.ADMIN) {
      throw new VaccineNotFoundException()
    }

    return vaccine
  }

  async updateVaccine(
    id: string,
    input: UpdateVaccineInput,
  ): Promise<Vaccine> {
    const vaccine = await this.requireById(id)

    if (input.name !== undefined) {
      const normalizedName = normalizeVaccineName(input.name)
      await this.assertUniqueName(normalizedName, id)
      vaccine.name = input.name.trim()
      vaccine.normalizedName = normalizedName
    }

    if (input.description !== undefined) {
      vaccine.description = input.description.trim()
    }

    if (input.manufacturer !== undefined) {
      vaccine.manufacturer = input.manufacturer.trim()
    }

    if (input.stockWarningThreshold !== undefined) {
      vaccine.stockWarningThreshold = input.stockWarningThreshold
    }

    if (input.active !== undefined) {
      vaccine.active = input.active
    }

    try {
      const saved = await this.vaccineRepository.save(vaccine)
      await this.applicationCache.invalidateVaccines()
      return saved
    } catch {
      throw new VaccineAlreadyExistsException()
    }
  }

  async setVaccineActive(id: string, active: boolean): Promise<Vaccine> {
    const vaccine = await this.requireById(id)
    vaccine.active = active
    const saved = await this.vaccineRepository.save(vaccine)
    await this.applicationCache.invalidateVaccines()
    return saved
  }
}
