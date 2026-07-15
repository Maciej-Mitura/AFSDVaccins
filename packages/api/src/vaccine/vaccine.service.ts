import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

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
  ) {}

  private async findByNormalizedName(
    normalizedName: string,
  ): Promise<Vaccine | null> {
    return this.vaccineRepository.findOne({
      where: { normalizedName },
    })
  }

  private async requireById(id: string): Promise<Vaccine> {
    if (!ObjectId.isValid(id)) {
      throw new VaccineNotFoundException()
    }

    const vaccine = await this.vaccineRepository.findOne({
      where: { _id: new ObjectId(id) },
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
      return await this.vaccineRepository.save(vaccine)
    } catch {
      throw new VaccineAlreadyExistsException()
    }
  }

  async findVaccines(
    includeInactive: boolean,
    role: UserRole,
  ): Promise<Vaccine[]> {
    const canIncludeInactive = role === UserRole.ADMIN && includeInactive

    if (canIncludeInactive) {
      return this.vaccineRepository.find({
        order: { name: 'ASC' },
      })
    }

    return this.vaccineRepository.find({
      where: { active: true },
      order: { name: 'ASC' },
    })
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
      return await this.vaccineRepository.save(vaccine)
    } catch {
      throw new VaccineAlreadyExistsException()
    }
  }

  async setVaccineActive(id: string, active: boolean): Promise<Vaccine> {
    const vaccine = await this.requireById(id)
    vaccine.active = active
    return this.vaccineRepository.save(vaccine)
  }
}
