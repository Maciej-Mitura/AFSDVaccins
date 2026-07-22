import { DataSource } from 'typeorm'

import { getLocalCalendarDate, getLocalTomorrowDate } from '../../src/order/delivery-date.util'
import { Order } from '../../src/order/order.entity'
import { OrderStatus } from '../../src/order/order-status.enum'
import { ApothekerProfile } from '../../src/profile/apotheker/apotheker-profile.entity'
import { BezorgerProfile } from '../../src/profile/bezorger/bezorger-profile.entity'
import { RouteTemplate } from '../../src/route-templates/route-template.entity'
import { DeliveryRoute } from '../../src/routes/delivery-route.entity'
import { RouteStatus } from '../../src/routes/route-status.enum'
import { ApplicationSettings } from '../../src/settings/settings.entity'
import {
  APPLICATION_SETTINGS_DEFAULTS,
  DEFAULT_TIMEZONE,
} from '../../src/settings/settings.constants'
import { User } from '../../src/user/user.entity'
import { UserRole } from '../../src/user/user-role.enum'
import { Vaccine } from '../../src/vaccine/vaccine.entity'
import { normalizeVaccineName } from '../../src/vaccine/vaccine.utils'
import { E2E_IDENTITIES, E2E_TOKENS } from './e2e-firebase.override'

export type E2eAddress = {
  street: string
  houseNumber: string
  postalCode: string
  city: string
  country: string
}

export const E2E_DEFAULT_ADDRESS: E2eAddress = {
  street: 'Markt',
  houseNumber: '1',
  postalCode: '8000',
  city: 'Brugge',
  country: 'BE',
}

/**
 * Focused E2E fixture builder — real repositories, deterministic identities.
 * Does not use the Phase 15 seed CLI.
 */
export class E2eFixtureBuilder {
  constructor(private readonly dataSource: DataSource) {}

  async createUser(input: {
    firebaseUid: string
    email: string
    firstName: string
    lastName: string
    role: UserRole
  }): Promise<User> {
    const repo = this.dataSource.getMongoRepository(User)
    return repo.save(
      repo.create({
        firebaseUid: input.firebaseUid,
        email: input.email.toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
      }),
    )
  }

  async createAdmin(): Promise<User> {
    const identity = E2E_IDENTITIES[E2E_TOKENS.admin]
    return this.createUser({
      firebaseUid: identity.uid,
      email: identity.email,
      firstName: 'Ada',
      lastName: 'Admin',
      role: UserRole.ADMIN,
    })
  }

  async createApotheker(token: typeof E2E_TOKENS.apotheker1 | typeof E2E_TOKENS.apotheker2 = E2E_TOKENS.apotheker1): Promise<{
    user: User
    profile: ApothekerProfile
  }> {
    const identity = E2E_IDENTITIES[token]
    const suffix = token === E2E_TOKENS.apotheker2 ? '2' : '1'
    const user = await this.createUser({
      firebaseUid: identity.uid,
      email: identity.email,
      firstName: `Anna${suffix}`,
      lastName: 'Apotheker',
      role: UserRole.APOTHEKER,
    })

    const profileRepo = this.dataSource.getMongoRepository(ApothekerProfile)
    const profile = await profileRepo.save(
      profileRepo.create({
        userId: user._id.toString(),
        pharmacyName: `E2E Apotheek ${suffix}`,
        address: { ...E2E_DEFAULT_ADDRESS, houseNumber: suffix },
      }),
    )

    return { user, profile }
  }

  async createBezorger(token: typeof E2E_TOKENS.bezorger1 | typeof E2E_TOKENS.bezorger2 = E2E_TOKENS.bezorger1): Promise<{
    user: User
    profile: BezorgerProfile
  }> {
    const identity = E2E_IDENTITIES[token]
    const suffix = token === E2E_TOKENS.bezorger2 ? '2' : '1'
    const user = await this.createUser({
      firebaseUid: identity.uid,
      email: identity.email,
      firstName: `Ben${suffix}`,
      lastName: 'Bezorger',
      role: UserRole.BEZORGER,
    })

    const profileRepo = this.dataSource.getMongoRepository(BezorgerProfile)
    const profile = await profileRepo.save(
      profileRepo.create({
        userId: user._id.toString(),
        displayName: `E2E Courier ${suffix}`,
        vehicleLabel: `VAN-${suffix}`,
      }),
    )

    return { user, profile }
  }

  async ensureSettings(
    overrides?: Partial<
      Pick<
        ApplicationSettings,
        | 'orderingClosingTime'
        | 'weeklyWarningPercentage'
        | 'weeklyDoseCap'
        | 'dailyDoseCapPerType'
        | 'timezone'
      >
    >,
  ): Promise<ApplicationSettings> {
    const repo = this.dataSource.getMongoRepository(ApplicationSettings)
    const existing = await repo.findOne({
      where: { singletonKey: APPLICATION_SETTINGS_DEFAULTS.singletonKey },
    })

    if (existing) {
      Object.assign(existing, overrides ?? {})
      return repo.save(existing)
    }

    return repo.save(
      repo.create({
        ...APPLICATION_SETTINGS_DEFAULTS,
        ...overrides,
      }),
    )
  }

  async createVaccine(input: {
    name: string
    manufacturer?: string
    stockQuantity?: number
    stockWarningThreshold?: number
    active?: boolean
    description?: string
  }): Promise<Vaccine> {
    const repo = this.dataSource.getMongoRepository(Vaccine)
    return repo.save(
      repo.create({
        name: input.name.trim(),
        normalizedName: normalizeVaccineName(input.name),
        manufacturer: input.manufacturer ?? 'E2E Labs',
        description: input.description ?? '',
        stockQuantity: input.stockQuantity ?? 100,
        stockWarningThreshold: input.stockWarningThreshold ?? 10,
        active: input.active ?? true,
      }),
    )
  }

  async createOrder(input: {
    apothekerUserId: string
    vaccine: Vaccine
    quantity: number
    deliveryDate: string
    status?: OrderStatus
    /** Defaults to 08:00 UTC so Europe/Brussels is still before 14:00 closing. */
    submittedAt?: Date
  }): Promise<Order> {
    const repo = this.dataSource.getMongoRepository(Order)
    const status = input.status ?? OrderStatus.PENDING
    const submittedAt = input.submittedAt ?? (() => {
      const early = new Date()
      early.setUTCHours(6, 0, 0, 0)
      return early
    })()

    return repo.save(
      repo.create({
        apothekerId: input.apothekerUserId,
        status,
        orderLines: [
          {
            vaccineId: input.vaccine._id.toString(),
            vaccineName: input.vaccine.name,
            manufacturer: input.vaccine.manufacturer,
            quantity: input.quantity,
          },
        ],
        totalQuantity: input.quantity,
        isoWeek: 1,
        isoYear: 2026,
        submittedAt,
        deliveryDate: input.deliveryDate,
        statusHistory: [
          {
            fromStatus: null,
            toStatus: status,
            changedAt: submittedAt,
            changedByUserId: input.apothekerUserId,
          },
        ],
      }),
    )
  }

  async createRouteTemplate(input: {
    name: string
    bezorgerProfileId: string
    apothekerProfileIds: string[]
    createdByUserId: string
    active?: boolean
  }): Promise<RouteTemplate> {
    const repo = this.dataSource.getMongoRepository(RouteTemplate)
    const normalizedName = normalizeVaccineName(input.name)

    return repo.save(
      repo.create({
        name: input.name.trim(),
        normalizedName,
        description: 'E2E template',
        active: input.active ?? true,
        bezorgerProfileId: input.bezorgerProfileId,
        stops: input.apothekerProfileIds.map((apothekerProfileId, index) => ({
          sequence: index + 1,
          apothekerProfileId,
        })),
        createdByUserId: input.createdByUserId,
        updatedByUserId: input.createdByUserId,
      }),
    )
  }

  async createDeliveryRoute(input: {
    routeTemplateId: string
    bezorgerProfileId: string
    deliveryDate: string
    generatedByUserId: string
    status?: RouteStatus
    stops?: DeliveryRoute['stops']
    skippedApothekerProfileIds?: string[]
  }): Promise<DeliveryRoute> {
    const repo = this.dataSource.getMongoRepository(DeliveryRoute)
    const now = new Date()
    const status = input.status ?? RouteStatus.ASSIGNED

    return repo.save(
      repo.create({
        routeTemplateId: input.routeTemplateId,
        bezorgerProfileId: input.bezorgerProfileId,
        deliveryDate: input.deliveryDate,
        status,
        stops: input.stops ?? [],
        skippedApothekerProfileIds: input.skippedApothekerProfileIds ?? [],
        statusHistory: [
          {
            fromStatus: null,
            toStatus: status,
            changedAt: now,
            changedByUserId: input.generatedByUserId,
          },
        ],
        generatedAt: now,
        generatedByUserId: input.generatedByUserId,
      }),
    )
  }

  todayBrussels(now: Date = new Date()): string {
    return getLocalCalendarDate(now, DEFAULT_TIMEZONE)
  }

  tomorrowBrussels(now: Date = new Date()): string {
    return getLocalTomorrowDate(now, DEFAULT_TIMEZONE)
  }
}
