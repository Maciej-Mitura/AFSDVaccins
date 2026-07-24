import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import {
  addLocalDays,
  formatLocalDate,
  getIsoWeekYearForDeliveryDate,
  getLocalCalendarDate,
  getZonedDateParts,
} from '../order/delivery-date.util'
import { Order } from '../order/order.entity'
import { OrderStatus } from '../order/order-status.enum'
import { ApothekerProfile } from '../profile/apotheker/apotheker-profile.entity'
import { BezorgerProfile } from '../profile/bezorger/bezorger-profile.entity'
import { RouteGenerationService } from '../routes/route-generation.service'
import { RouteTemplate } from '../route-templates/route-template.entity'
import { normalizeRouteTemplateName } from '../route-templates/route-template.utils'
import { APPLICATION_SETTINGS_DEFAULTS } from '../settings/settings.constants'
import { ApplicationSettings } from '../settings/settings.entity'
import { SettingsService } from '../settings/settings.service'
import { StockAdjustmentType } from '../stock/stock-adjustment-type.enum'
import { StockAdjustmentRepository } from '../stock/stock-adjustment.repository'
import { VaccineStockRepository } from '../stock/vaccine-stock.repository'
import { User } from '../user/user.entity'
import { Vaccine } from '../vaccine/vaccine.entity'
import { normalizeVaccineName } from '../vaccine/vaccine.utils'
import {
  resolveSeedAccounts,
  SEED_APOTHEKER_PROFILES,
  SEED_BEZORGER_PROFILES,
  SeedAccountKey,
} from './seed.accounts'
import { SeedFirebaseProvisioningService } from './seed-firebase-provisioning.service'
import {
  SEED_ORDER_IDS,
  SEED_ROUTE_TEMPLATE_BEZORGER1,
  SEED_ROUTE_TEMPLATE_BEZORGER2,
  SEED_VACCINES,
  seedOrderObjectId,
} from './seed.constants'
import { BootstrapSafetyService } from './bootstrap.safety'
import { SeedSafetyService } from './seed.safety'

export type SeedCounters = {
  firebaseCreated: number
  firebaseReused: number
  usersCreated: number
  usersReused: number
  profilesCreated: number
  profilesReused: number
  adminProfilesRemoved: number
  settingsCreated: number
  settingsReused: number
  vaccinesCreated: number
  vaccinesReused: number
  stockReconciled: number
  stockSkipped: number
  ordersCreated: number
  ordersReused: number
  templatesCreated: number
  templatesReused: number
  routesCreated: number
  routesReused: number
}

type SeededUsers = Record<SeedAccountKey, User>
type SeededApothekerProfiles = Record<
  'apotheker1' | 'apotheker2' | 'apotheker3',
  ApothekerProfile
>
type SeededBezorgerProfiles = Record<'bezorger1' | 'bezorger2', BezorgerProfile>
type SeededVaccines = Record<'influenza' | 'covid-19' | 'mmr', Vaccine>

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name)

  constructor(
    private readonly seedSafetyService: SeedSafetyService,
    private readonly bootstrapSafetyService: BootstrapSafetyService,
    private readonly firebaseProvisioning: SeedFirebaseProvisioningService,
    private readonly settingsService: SettingsService,
    private readonly routeGenerationService: RouteGenerationService,
    private readonly stockAdjustmentWriter: StockAdjustmentRepository,
    private readonly vaccineStockRepository: VaccineStockRepository,
    @InjectRepository(User)
    private readonly userRepository: MongoRepository<User>,
    @InjectRepository(ApothekerProfile)
    private readonly apothekerProfileRepository: MongoRepository<ApothekerProfile>,
    @InjectRepository(BezorgerProfile)
    private readonly bezorgerProfileRepository: MongoRepository<BezorgerProfile>,
    @InjectRepository(ApplicationSettings)
    private readonly settingsRepository: MongoRepository<ApplicationSettings>,
    @InjectRepository(Vaccine)
    private readonly vaccineRepository: MongoRepository<Vaccine>,
    @InjectRepository(Order)
    private readonly orderRepository: MongoRepository<Order>,
    @InjectRepository(RouteTemplate)
    private readonly routeTemplateRepository: MongoRepository<RouteTemplate>,
  ) {}

  /** Development seed CLI — requires NODE_ENV=development + ALLOW_DATABASE_SEED. */
  async run(): Promise<SeedCounters> {
    this.seedSafetyService.assertSeedAllowed()
    this.seedSafetyService.logSeedTargetConfirmation()
    return this.executeSeeding({
      demoPassword: this.seedSafetyService.requireDemoPassword(),
      teacherPassword: this.seedSafetyService.requireTeacherAdminPassword(),
      personalAdminEmail: this.seedSafetyService.requirePersonalAdminEmail(),
    })
  }

  /**
   * One-off production/demo bootstrap CLI.
   * Requires ALLOW_DATABASE_BOOTSTRAP + CONFIRM_DATABASE_BOOTSTRAP; does not
   * require NODE_ENV=development. Never called from API startup.
   */
  async runBootstrap(): Promise<SeedCounters> {
    this.bootstrapSafetyService.assertBootstrapAllowed()
    this.bootstrapSafetyService.logBootstrapTargetConfirmation()
    return this.executeSeeding({
      demoPassword: this.bootstrapSafetyService.requireDemoPassword(),
      teacherPassword: this.bootstrapSafetyService.requireTeacherAdminPassword(),
      personalAdminEmail: this.bootstrapSafetyService.requirePersonalAdminEmail(),
    })
  }

  private async executeSeeding(credentials: {
    demoPassword: string
    teacherPassword: string
    personalAdminEmail: string
  }): Promise<SeedCounters> {
    const { demoPassword, teacherPassword, personalAdminEmail } = credentials

    const counters = this.emptyCounters()
    const accounts = resolveSeedAccounts({
      personalAdminEmail,
      demoPassword,
      teacherPassword,
    })

    const users = await this.seedUsers(accounts, counters)
    await this.clearAccidentalAdminRoleProfiles(
      [users.personalAdmin, users.docent],
      counters,
    )
    const apothekerProfiles = await this.seedApothekerProfiles(users, counters)
    const bezorgerProfiles = await this.seedBezorgerProfiles(users, counters)
    await this.seedSettings(counters)
    const vaccines = await this.seedVaccines(counters)
    await this.seedStock(users.docent, vaccines, counters)

    const settings = await this.settingsService.getApplicationSettings()
    const timezone = settings.timezone
    const now = new Date()
    const today = getLocalCalendarDate(now, timezone)
    const tomorrow = formatLocalDate(
      addLocalDays(getZonedDateParts(now, timezone), 1),
    )

    await this.seedOrders(users, vaccines, today, tomorrow, counters)

    const templateBezorger1 = await this.seedRouteTemplate({
      name: SEED_ROUTE_TEMPLATE_BEZORGER1.name,
      description: SEED_ROUTE_TEMPLATE_BEZORGER1.description,
      bezorgerProfile: bezorgerProfiles.bezorger1,
      stopProfiles: [
        apothekerProfiles.apotheker1,
        apothekerProfiles.apotheker2,
        apothekerProfiles.apotheker3,
      ],
      admin: users.docent,
      counters,
    })

    await this.seedRouteTemplate({
      name: SEED_ROUTE_TEMPLATE_BEZORGER2.name,
      description: SEED_ROUTE_TEMPLATE_BEZORGER2.description,
      bezorgerProfile: bezorgerProfiles.bezorger2,
      stopProfiles: [apothekerProfiles.apotheker3],
      admin: users.docent,
      counters,
    })

    await this.seedTodayRoute(users.docent, templateBezorger1, today, counters)

    this.printSummary(counters, today, tomorrow)
    return counters
  }

  private emptyCounters(): SeedCounters {
    return {
      firebaseCreated: 0,
      firebaseReused: 0,
      usersCreated: 0,
      usersReused: 0,
      profilesCreated: 0,
      profilesReused: 0,
      adminProfilesRemoved: 0,
      settingsCreated: 0,
      settingsReused: 0,
      vaccinesCreated: 0,
      vaccinesReused: 0,
      stockReconciled: 0,
      stockSkipped: 0,
      ordersCreated: 0,
      ordersReused: 0,
      templatesCreated: 0,
      templatesReused: 0,
      routesCreated: 0,
      routesReused: 0,
    }
  }

  private async seedUsers(
    accounts: ReturnType<typeof resolveSeedAccounts>,
    counters: SeedCounters,
  ): Promise<SeededUsers> {
    const users = {} as SeededUsers

    for (const account of accounts) {
      const firebase = await this.firebaseProvisioning.ensureFirebaseUser(account)

      if (firebase.created) {
        counters.firebaseCreated += 1
      } else {
        counters.firebaseReused += 1
      }

      const existing = await this.userRepository.findOne({
        where: { firebaseUid: firebase.uid },
      })

      if (existing) {
        existing.email = account.email.toLowerCase()
        existing.firstName = account.firstName
        existing.lastName = account.lastName
        existing.role = account.role
        users[account.key] = await this.userRepository.save(existing)
        counters.usersReused += 1
      } else {
        const created = this.userRepository.create({
          firebaseUid: firebase.uid,
          email: account.email.toLowerCase(),
          firstName: account.firstName,
          lastName: account.lastName,
          role: account.role,
        })
        users[account.key] = await this.userRepository.save(created)
        counters.usersCreated += 1
      }
    }

    return users
  }

  /**
   * ADMIN must never carry pharmacist/courier profiles. Remove any accidental
   * role profiles linked to seeded ADMIN user IDs (e.g. after a prior
   * self-registration that was later promoted to ADMIN by seed).
   */
  private async clearAccidentalAdminRoleProfiles(
    adminUsers: User[],
    counters: SeedCounters,
  ): Promise<void> {
    for (const admin of adminUsers) {
      const userId = admin._id.toString()

      const apotheker = await this.apothekerProfileRepository.findOne({
        where: { userId },
      })
      if (apotheker) {
        await this.apothekerProfileRepository.remove(apotheker)
        counters.adminProfilesRemoved += 1
        this.logger.warn(
          `Removed accidental ApothekerProfile linked to ADMIN ${admin.email}`,
        )
      }

      const bezorger = await this.bezorgerProfileRepository.findOne({
        where: { userId },
      })
      if (bezorger) {
        await this.bezorgerProfileRepository.remove(bezorger)
        counters.adminProfilesRemoved += 1
        this.logger.warn(
          `Removed accidental BezorgerProfile linked to ADMIN ${admin.email}`,
        )
      }
    }
  }

  private async seedApothekerProfiles(
    users: SeededUsers,
    counters: SeedCounters,
  ): Promise<SeededApothekerProfiles> {
    const profiles = {} as SeededApothekerProfiles

    for (const definition of SEED_APOTHEKER_PROFILES) {
      const user = users[definition.accountKey]
      const userId = user._id.toString()
      const existing = await this.apothekerProfileRepository.findOne({
        where: { userId },
      })

      if (existing) {
        existing.pharmacyName = definition.pharmacyName
        existing.address = { ...definition.address }
        profiles[definition.accountKey] =
          await this.apothekerProfileRepository.save(existing)
        counters.profilesReused += 1
      } else {
        const created = this.apothekerProfileRepository.create({
          userId,
          pharmacyName: definition.pharmacyName,
          address: { ...definition.address },
        })
        profiles[definition.accountKey] =
          await this.apothekerProfileRepository.save(created)
        counters.profilesCreated += 1
      }
    }

    return profiles
  }

  private async seedBezorgerProfiles(
    users: SeededUsers,
    counters: SeedCounters,
  ): Promise<SeededBezorgerProfiles> {
    const profiles = {} as SeededBezorgerProfiles

    for (const definition of SEED_BEZORGER_PROFILES) {
      const user = users[definition.accountKey]
      const userId = user._id.toString()
      const existing = await this.bezorgerProfileRepository.findOne({
        where: { userId },
      })

      if (existing) {
        existing.displayName = definition.displayName
        existing.vehicleLabel = definition.vehicleLabel
        profiles[definition.accountKey] =
          await this.bezorgerProfileRepository.save(existing)
        counters.profilesReused += 1
      } else {
        const created = this.bezorgerProfileRepository.create({
          userId,
          displayName: definition.displayName,
          vehicleLabel: definition.vehicleLabel,
        })
        profiles[definition.accountKey] =
          await this.bezorgerProfileRepository.save(created)
        counters.profilesCreated += 1
      }
    }

    return profiles
  }

  private async seedSettings(counters: SeedCounters): Promise<void> {
    const existing = await this.settingsRepository.findOne({
      where: { singletonKey: APPLICATION_SETTINGS_DEFAULTS.singletonKey },
    })

    if (existing) {
      existing.timezone = APPLICATION_SETTINGS_DEFAULTS.timezone
      existing.orderingClosingTime =
        APPLICATION_SETTINGS_DEFAULTS.orderingClosingTime
      existing.weeklyWarningPercentage =
        APPLICATION_SETTINGS_DEFAULTS.weeklyWarningPercentage
      existing.weeklyDoseCap = APPLICATION_SETTINGS_DEFAULTS.weeklyDoseCap
      existing.dailyDoseCapPerType =
        APPLICATION_SETTINGS_DEFAULTS.dailyDoseCapPerType
      await this.settingsRepository.save(existing)
      counters.settingsReused += 1
      return
    }

    const created = this.settingsRepository.create({
      ...APPLICATION_SETTINGS_DEFAULTS,
    })
    await this.settingsRepository.save(created)
    counters.settingsCreated += 1
  }

  private async seedVaccines(counters: SeedCounters): Promise<SeededVaccines> {
    const vaccines = {} as SeededVaccines

    for (const definition of SEED_VACCINES) {
      const normalizedName = normalizeVaccineName(definition.name)
      const existing = await this.vaccineRepository.findOne({
        where: { normalizedName },
      })

      if (existing) {
        existing.name = definition.name
        existing.description = definition.description
        existing.manufacturer = definition.manufacturer
        existing.stockWarningThreshold = definition.stockWarningThreshold
        existing.active = true
        const saved = await this.vaccineRepository.save(existing)
        vaccines[normalizedName as keyof SeededVaccines] = saved
        counters.vaccinesReused += 1
      } else {
        const created = this.vaccineRepository.create({
          name: definition.name,
          normalizedName,
          description: definition.description,
          manufacturer: definition.manufacturer,
          stockQuantity: 0,
          stockWarningThreshold: definition.stockWarningThreshold,
          active: true,
        })
        const saved = await this.vaccineRepository.save(created)
        vaccines[normalizedName as keyof SeededVaccines] = saved
        counters.vaccinesCreated += 1
      }
    }

    return vaccines
  }

  private async seedStock(
    admin: User,
    vaccines: SeededVaccines,
    counters: SeedCounters,
  ): Promise<void> {
    for (const definition of SEED_VACCINES) {
      const normalizedName = normalizeVaccineName(definition.name)
      const vaccine = vaccines[normalizedName as keyof SeededVaccines]
      const vaccineObjectId = new ObjectId(vaccine._id.toString())

      const existingAdjustment =
        await this.stockAdjustmentWriter.findByIdempotencyKey(
          definition.stockIdempotencyKey,
        )

      const current = vaccine.stockQuantity
      const target = definition.targetStock

      if (current === target) {
        counters.stockSkipped += 1
        continue
      }

      const delta = target - current
      const updateResult = await this.vaccineStockRepository.adjustStockQuantity(
        vaccineObjectId,
        delta,
      )

      if (!updateResult) {
        throw new Error(
          `Failed to reconcile seed stock for ${definition.name}`,
        )
      }

      vaccine.stockQuantity = updateResult.quantityAfter

      if (!existingAdjustment) {
        await this.stockAdjustmentWriter.insertIdempotentAdjustment({
          vaccineObjectId,
          type: StockAdjustmentType.MANUAL_CORRECTION,
          quantityDelta: delta,
          quantityBefore: updateResult.quantityBefore,
          quantityAfter: updateResult.quantityAfter,
          reason: `Seed stock target for ${definition.name}`,
          performedByUserId: admin._id.toString(),
          relatedOrderId: null,
          idempotencyKey: definition.stockIdempotencyKey,
        })
      }

      counters.stockReconciled += 1
    }
  }

  private async seedOrders(
    users: SeededUsers,
    vaccines: SeededVaccines,
    today: string,
    tomorrow: string,
    counters: SeedCounters,
  ): Promise<void> {
    const flu = vaccines.influenza
    const covid = vaccines['covid-19']
    const mmr = vaccines.mmr

    const closingBefore = this.buildLocalInstant(today, 13, 59)
    const closingAfter = this.buildLocalInstant(today, 14, 1)

    await this.upsertOrder(
      {
        id: seedOrderObjectId('apotheker1Today'),
        apotheker: users.apotheker1,
        deliveryDate: today,
        submittedAt: closingBefore,
        lines: [
          {
            vaccineId: flu._id.toString(),
            vaccineName: flu.name,
            manufacturer: flu.manufacturer,
            quantity: 48,
          },
        ],
      },
      counters,
    )

    await this.upsertOrder(
      {
        id: seedOrderObjectId('apotheker1Tomorrow'),
        apotheker: users.apotheker1,
        deliveryDate: tomorrow,
        submittedAt: closingAfter,
        lines: [
          {
            vaccineId: covid._id.toString(),
            vaccineName: covid.name,
            manufacturer: covid.manufacturer,
            quantity: 10,
          },
        ],
      },
      counters,
    )

    await this.upsertOrder(
      {
        id: seedOrderObjectId('apotheker2Today'),
        apotheker: users.apotheker2,
        deliveryDate: today,
        submittedAt: closingBefore,
        lines: [
          {
            vaccineId: flu._id.toString(),
            vaccineName: flu.name,
            manufacturer: flu.manufacturer,
            quantity: 50,
          },
          {
            vaccineId: covid._id.toString(),
            vaccineName: covid.name,
            manufacturer: covid.manufacturer,
            quantity: 50,
          },
          {
            vaccineId: mmr._id.toString(),
            vaccineName: mmr.name,
            manufacturer: mmr.manufacturer,
            quantity: 45,
          },
        ],
      },
      counters,
    )

    await this.upsertOrder(
      {
        id: seedOrderObjectId('apotheker2Tomorrow'),
        apotheker: users.apotheker2,
        deliveryDate: tomorrow,
        submittedAt: closingAfter,
        lines: [
          {
            vaccineId: flu._id.toString(),
            vaccineName: flu.name,
            manufacturer: flu.manufacturer,
            quantity: 50,
          },
        ],
      },
      counters,
    )
  }

  private buildLocalInstant(
    localDate: string,
    hour: number,
    minute: number,
  ): Date {
    // Construct a UTC instant that formats as the given local Europe/Brussels wall time.
    // Approximation via iterative offset is unnecessary for seed demos: use noon-offset trick.
    const [year, month, day] = localDate.split('-').map(Number)
    const guess = new Date(Date.UTC(year, month - 1, day, hour - 1, minute, 0))
    const parts = getZonedDateParts(guess, 'Europe/Brussels')
    const desiredMinutes = hour * 60 + minute
    const actualMinutes = parts.hour * 60 + parts.minute
    const deltaMinutes = desiredMinutes - actualMinutes
    return new Date(guess.getTime() + deltaMinutes * 60_000)
  }

  private async upsertOrder(
    input: {
      id: ObjectId
      apotheker: User
      deliveryDate: string
      submittedAt: Date
      lines: Array<{
        vaccineId: string
        vaccineName: string
        manufacturer: string
        quantity: number
      }>
    },
    counters: SeedCounters,
  ): Promise<void> {
    const totalQuantity = input.lines.reduce(
      (sum, line) => sum + line.quantity,
      0,
    )
    const { isoWeek, isoYear } = getIsoWeekYearForDeliveryDate(
      input.deliveryDate,
    )
    const apothekerId = input.apotheker._id.toString()

    const existing = await this.orderRepository.findOne({
      where: { _id: input.id },
    })

    if (existing) {
      existing.apothekerId = apothekerId
      existing.orderLines = input.lines
      existing.totalQuantity = totalQuantity
      existing.isoWeek = isoWeek
      existing.isoYear = isoYear
      existing.submittedAt = input.submittedAt
      existing.deliveryDate = input.deliveryDate

      if (
        !Array.isArray(existing.statusHistory) ||
        existing.statusHistory.length === 0
      ) {
        existing.status = OrderStatus.PENDING
        existing.statusHistory = [
          {
            fromStatus: null,
            toStatus: OrderStatus.PENDING,
            changedAt: input.submittedAt,
            changedByUserId: apothekerId,
            reason: 'Seed order created',
          },
        ]
      }

      // Never force DELIVERED; keep PENDING/PLANNED as-is for idempotent re-runs.
      if (
        existing.status !== OrderStatus.PENDING &&
        existing.status !== OrderStatus.PLANNED
      ) {
        existing.status = OrderStatus.PENDING
        existing.statusHistory = [
          {
            fromStatus: null,
            toStatus: OrderStatus.PENDING,
            changedAt: input.submittedAt,
            changedByUserId: apothekerId,
            reason: 'Seed order reset to PENDING',
          },
        ]
      }

      await this.orderRepository.save(existing)
      counters.ordersReused += 1
      return
    }

    await this.orderRepository.insertOne({
      _id: input.id,
      apothekerId,
      status: OrderStatus.PENDING,
      orderLines: input.lines,
      totalQuantity,
      isoWeek,
      isoYear,
      submittedAt: input.submittedAt,
      deliveryDate: input.deliveryDate,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedAt: input.submittedAt,
          changedByUserId: apothekerId,
          reason: 'Seed order created',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    counters.ordersCreated += 1
  }

  private async seedRouteTemplate(params: {
    name: string
    description: string
    bezorgerProfile: BezorgerProfile
    stopProfiles: ApothekerProfile[]
    admin: User
    counters: SeedCounters
  }): Promise<RouteTemplate> {
    const normalizedName = normalizeRouteTemplateName(params.name)
    const bezorgerProfileId = params.bezorgerProfile._id.toString()
    const adminId = params.admin._id.toString()
    const stops = params.stopProfiles.map((profile, index) => ({
      sequence: index + 1,
      apothekerProfileId: profile._id.toString(),
    }))

    const existing = await this.routeTemplateRepository.findOne({
      where: { normalizedName },
    })

    if (existing) {
      existing.name = params.name
      existing.description = params.description
      existing.active = true
      existing.bezorgerProfileId = bezorgerProfileId
      existing.stops = stops
      existing.updatedByUserId = adminId
      const saved = await this.routeTemplateRepository.save(existing)
      params.counters.templatesReused += 1
      return saved
    }

    const created = this.routeTemplateRepository.create({
      name: params.name,
      normalizedName,
      description: params.description,
      active: true,
      bezorgerProfileId,
      stops,
      createdByUserId: adminId,
      updatedByUserId: adminId,
    })
    const saved = await this.routeTemplateRepository.save(created)
    params.counters.templatesCreated += 1
    return saved
  }

  private async seedTodayRoute(
    admin: User,
    template: RouteTemplate,
    today: string,
    counters: SeedCounters,
  ): Promise<void> {
    const existingBefore =
      await this.routeGenerationService.findByBezorgerAndDate(
        template.bezorgerProfileId,
        today,
      )

    await this.routeGenerationService.generateDeliveryRoute(
      admin,
      template._id.toString(),
      today,
    )

    if (existingBefore) {
      counters.routesReused += 1
    } else {
      counters.routesCreated += 1
    }
  }

  private printSummary(
    counters: SeedCounters,
    today: string,
    tomorrow: string,
  ): void {
    this.logger.log('Seed complete')
    this.logger.log(
      `- Firebase Auth: created ${counters.firebaseCreated}, reused ${counters.firebaseReused}`,
    )
    this.logger.log(
      `- Users: created ${counters.usersCreated}, reused ${counters.usersReused}`,
    )
    this.logger.log(
      `- Profiles: created ${counters.profilesCreated}, reused ${counters.profilesReused}`,
      `- Accidental ADMIN role profiles removed: ${counters.adminProfilesRemoved}`,
    )
    this.logger.log(
      `- Settings: created ${counters.settingsCreated}, reused ${counters.settingsReused}`,
    )
    this.logger.log(
      `- Vaccines: created ${counters.vaccinesCreated}, reused ${counters.vaccinesReused}`,
    )
    this.logger.log(
      `- Stock: reconciled ${counters.stockReconciled}, already-at-target ${counters.stockSkipped}`,
    )
    this.logger.log(
      `- Orders: created ${counters.ordersCreated}, reused ${counters.ordersReused}`,
    )
    this.logger.log(
      `- Route templates: created ${counters.templatesCreated}, reused ${counters.templatesReused}`,
    )
    this.logger.log(
      `- Delivery routes: created ${counters.routesCreated}, reused ${counters.routesReused}`,
    )
    this.logger.log(
      `- Dates (Europe/Brussels): today=${today}, tomorrow=${tomorrow} (preview only)`,
    )
    this.logger.log(
      `- Order IDs: ${Object.values(SEED_ORDER_IDS).join(', ')}`,
    )
  }
}
