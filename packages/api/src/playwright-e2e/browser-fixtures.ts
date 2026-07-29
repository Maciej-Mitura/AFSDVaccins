import { DataSource } from 'typeorm'

import { E2E_IDENTITIES, E2E_TOKENS } from '../authentication/e2e-auth-bypass'
import {
  getLocalCalendarDate,
  getLocalTomorrowDate,
} from '../order/delivery-date.util'
import { Order } from '../order/order.entity'
import { OrderStatus } from '../order/order-status.enum'
import { ApothekerProfile } from '../profile/apotheker/apotheker-profile.entity'
import { BezorgerProfile } from '../profile/bezorger/bezorger-profile.entity'
import { RouteTemplate } from '../route-templates/route-template.entity'
import { DeliveryRoute } from '../routes/delivery-route.entity'
import { RouteStatus } from '../routes/route-status.enum'
import { createGeneratedStopQrState } from '../routes/qr/create-generated-stop-qr-state'
import { DELIVERY_QR_TEST_SIGNING_SECRET } from '../routes/qr/delivery-qr.constants'
import { HmacDeliveryQrTokenService } from '../routes/qr/hmac-delivery-qr-token.service'
import { ApplicationSettings } from '../settings/settings.entity'
import {
  APPLICATION_SETTINGS_DEFAULTS,
  DEFAULT_TIMEZONE,
} from '../settings/settings.constants'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { Vaccine } from '../vaccine/vaccine.entity'
import { normalizeVaccineName } from '../vaccine/vaccine.utils'
import { clearPlaywrightCollections } from './playwright-collections'

export { PLAYWRIGHT_DB_NAME } from './playwright-constants'

export type PlaywrightSeedSummary = {
  adminEmail: string
  apotheker1Email: string
  apotheker2Email: string
  bezorger1Email: string
  bezorger2Email: string
  todayRouteId: string
  todayStopId: string
  /** Test-only bearer for QR confirm REST — never log in production paths. */
  todayStopQrToken: string
  todayDeliveryDate: string
  tomorrowDeliveryDate: string
  pharmacy1Name: string
  vaccineName: string
  todayOrderQuantity: number
  todayOrderId: string
}

const DEFAULT_ADDRESS = {
  street: 'Markt',
  houseNumber: '1',
  postalCode: '8000',
  city: 'Brugge',
  country: 'BE',
}

/**
 * Deterministic Playwright browser-test dataset.
 * Does not use the Phase 15 seed CLI or the developer database.
 */
export async function seedPlaywrightBrowserFixtures(
  dataSource: DataSource,
): Promise<PlaywrightSeedSummary> {
  await clearPlaywrightCollections(dataSource)

  const userRepo = dataSource.getMongoRepository(User)
  const apothekerRepo = dataSource.getMongoRepository(ApothekerProfile)
  const bezorgerRepo = dataSource.getMongoRepository(BezorgerProfile)
  const settingsRepo = dataSource.getMongoRepository(ApplicationSettings)
  const vaccineRepo = dataSource.getMongoRepository(Vaccine)
  const orderRepo = dataSource.getMongoRepository(Order)
  const templateRepo = dataSource.getMongoRepository(RouteTemplate)
  const routeRepo = dataSource.getMongoRepository(DeliveryRoute)

  const adminIdentity = E2E_IDENTITIES[E2E_TOKENS.admin]
  const apotheker1Identity = E2E_IDENTITIES[E2E_TOKENS.apotheker1]
  const apotheker2Identity = E2E_IDENTITIES[E2E_TOKENS.apotheker2]
  const bezorger1Identity = E2E_IDENTITIES[E2E_TOKENS.bezorger1]
  const bezorger2Identity = E2E_IDENTITIES[E2E_TOKENS.bezorger2]

  const admin = await userRepo.save(
    userRepo.create({
      firebaseUid: adminIdentity.uid,
      email: adminIdentity.email.toLowerCase(),
      firstName: 'Ada',
      lastName: 'Admin',
      role: UserRole.ADMIN,
    }),
  )

  const apotheker1User = await userRepo.save(
    userRepo.create({
      firebaseUid: apotheker1Identity.uid,
      email: apotheker1Identity.email.toLowerCase(),
      firstName: 'Anna',
      lastName: 'Apotheker',
      role: UserRole.APOTHEKER,
    }),
  )
  const apotheker1Profile = await apothekerRepo.save(
    apothekerRepo.create({
      userId: apotheker1User._id.toString(),
      pharmacyName: 'E2E Apotheek 1',
      address: { ...DEFAULT_ADDRESS, houseNumber: '1' },
    }),
  )

  const apotheker2User = await userRepo.save(
    userRepo.create({
      firebaseUid: apotheker2Identity.uid,
      email: apotheker2Identity.email.toLowerCase(),
      firstName: 'Bram',
      lastName: 'Apotheker',
      role: UserRole.APOTHEKER,
    }),
  )
  await apothekerRepo.save(
    apothekerRepo.create({
      userId: apotheker2User._id.toString(),
      pharmacyName: 'E2E Apotheek 2',
      address: { ...DEFAULT_ADDRESS, houseNumber: '2', city: 'Gent', postalCode: '9000' },
    }),
  )

  const bezorger1User = await userRepo.save(
    userRepo.create({
      firebaseUid: bezorger1Identity.uid,
      email: bezorger1Identity.email.toLowerCase(),
      firstName: 'Ben',
      lastName: 'Bezorger',
      role: UserRole.BEZORGER,
    }),
  )
  const bezorger1Profile = await bezorgerRepo.save(
    bezorgerRepo.create({
      userId: bezorger1User._id.toString(),
      displayName: 'E2E Courier 1',
      vehicleLabel: 'VAN-1',
    }),
  )

  const bezorger2User = await userRepo.save(
    userRepo.create({
      firebaseUid: bezorger2Identity.uid,
      email: bezorger2Identity.email.toLowerCase(),
      firstName: 'Emma',
      lastName: 'Bezorger',
      role: UserRole.BEZORGER,
    }),
  )
  const bezorger2Profile = await bezorgerRepo.save(
    bezorgerRepo.create({
      userId: bezorger2User._id.toString(),
      displayName: 'E2E Courier 2',
      vehicleLabel: 'VAN-2',
    }),
  )

  await settingsRepo.save(
    settingsRepo.create({
      ...APPLICATION_SETTINGS_DEFAULTS,
    }),
  )

  const vaccine = await vaccineRepo.save(
    vaccineRepo.create({
      name: 'Playwright Flu',
      normalizedName: normalizeVaccineName('Playwright Flu'),
      manufacturer: 'E2E Labs',
      description: 'Browser E2E vaccine',
      stockQuantity: 500,
      stockWarningThreshold: 20,
      active: true,
    }),
  )

  const today = getLocalCalendarDate(new Date(), DEFAULT_TIMEZONE)
  const tomorrow = getLocalTomorrowDate(new Date(), DEFAULT_TIMEZONE)
  const earlySubmit = new Date()
  earlySubmit.setUTCHours(6, 0, 0, 0)

  const todayOrderQuantity = 12
  const todayOrder = await orderRepo.save(
    orderRepo.create({
      apothekerId: apotheker1User._id.toString(),
      status: OrderStatus.PLANNED,
      orderLines: [
        {
          vaccineId: vaccine._id.toString(),
          vaccineName: vaccine.name,
          manufacturer: vaccine.manufacturer,
          quantity: todayOrderQuantity,
        },
      ],
      totalQuantity: todayOrderQuantity,
      isoWeek: 1,
      isoYear: 2026,
      submittedAt: earlySubmit,
      deliveryDate: today,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: OrderStatus.PLANNED,
          changedAt: earlySubmit,
          changedByUserId: admin._id.toString(),
        },
      ],
    }),
  )

  // Second pharmacist private order — must not appear for apotheker1.
  await orderRepo.save(
    orderRepo.create({
      apothekerId: apotheker2User._id.toString(),
      status: OrderStatus.PENDING,
      orderLines: [
        {
          vaccineId: vaccine._id.toString(),
          vaccineName: vaccine.name,
          manufacturer: vaccine.manufacturer,
          quantity: 3,
        },
      ],
      totalQuantity: 3,
      isoWeek: 1,
      isoYear: 2026,
      submittedAt: earlySubmit,
      deliveryDate: today,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedAt: earlySubmit,
          changedByUserId: apotheker2User._id.toString(),
        },
      ],
    }),
  )

  // Tomorrow-qualifying order for preview (computed, not persisted as route).
  await orderRepo.save(
    orderRepo.create({
      apothekerId: apotheker1User._id.toString(),
      status: OrderStatus.PENDING,
      orderLines: [
        {
          vaccineId: vaccine._id.toString(),
          vaccineName: vaccine.name,
          manufacturer: vaccine.manufacturer,
          quantity: 5,
        },
      ],
      totalQuantity: 5,
      isoWeek: 1,
      isoYear: 2026,
      submittedAt: earlySubmit,
      deliveryDate: tomorrow,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedAt: earlySubmit,
          changedByUserId: apotheker1User._id.toString(),
        },
      ],
    }),
  )

  const template = await templateRepo.save(
    templateRepo.create({
      name: 'Playwright West',
      normalizedName: normalizeVaccineName('Playwright West'),
      description: 'Browser E2E template',
      active: true,
      bezorgerProfileId: bezorger1Profile._id.toString(),
      stops: [
        {
          sequence: 1,
          apothekerProfileId: apotheker1Profile._id.toString(),
        },
      ],
      createdByUserId: admin._id.toString(),
      updatedByUserId: admin._id.toString(),
    }),
  )

  // Second courier template — isolation check (no today route for courier 2).
  await templateRepo.save(
    templateRepo.create({
      name: 'Playwright East',
      normalizedName: normalizeVaccineName('Playwright East'),
      description: 'Second courier template',
      active: true,
      bezorgerProfileId: bezorger2Profile._id.toString(),
      stops: [
        {
          sequence: 1,
          apothekerProfileId: apotheker1Profile._id.toString(),
        },
      ],
      createdByUserId: admin._id.toString(),
      updatedByUserId: admin._id.toString(),
    }),
  )

  const now = new Date()
  const todayRouteDraft = await routeRepo.save(
    routeRepo.create({
      routeTemplateId: template._id.toString(),
      bezorgerProfileId: bezorger1Profile._id.toString(),
      deliveryDate: today,
      status: RouteStatus.ASSIGNED,
      stops: [
        {
          sequence: 1,
          apothekerProfileId: apotheker1Profile._id.toString(),
          apothekerUserId: apotheker1User._id.toString(),
          pharmacyName: apotheker1Profile.pharmacyName,
          address: apotheker1Profile.address,
          orderIds: [todayOrder._id.toString()],
          orderCount: 1,
          totalQuantity: todayOrderQuantity,
          lines: [
            {
              vaccineId: vaccine._id.toString(),
              vaccineName: vaccine.name,
              manufacturer: vaccine.manufacturer,
              quantity: todayOrderQuantity,
            },
          ],
        },
      ],
      skippedApothekerProfileIds: [],
      statusHistory: [
        {
          fromStatus: null,
          toStatus: RouteStatus.ASSIGNED,
          changedAt: now,
          changedByUserId: admin._id.toString(),
        },
      ],
      generatedAt: now,
      generatedByUserId: admin._id.toString(),
    }),
  )

  const routeId = todayRouteDraft._id.toString()
  const tokenService = new HmacDeliveryQrTokenService(
    process.env.DELIVERY_QR_SIGNING_SECRET ?? DELIVERY_QR_TEST_SIGNING_SECRET,
  )
  const { stopId, qrConfirmation } = createGeneratedStopQrState({
    routeId,
    tokenService,
    issuedAt: now,
  })

  todayRouteDraft.stops[0] = {
    ...todayRouteDraft.stops[0],
    stopId,
    qrConfirmation,
    deliveryProof: null,
  }
  const todayRoute = await routeRepo.save(todayRouteDraft)

  return {
    adminEmail: adminIdentity.email,
    apotheker1Email: apotheker1Identity.email,
    apotheker2Email: apotheker2Identity.email,
    bezorger1Email: bezorger1Identity.email,
    bezorger2Email: bezorger2Identity.email,
    todayRouteId: todayRoute._id.toString(),
    todayStopId: stopId,
    todayStopQrToken: qrConfirmation.encodedToken,
    todayDeliveryDate: today,
    tomorrowDeliveryDate: tomorrow,
    pharmacy1Name: apotheker1Profile.pharmacyName,
    vaccineName: vaccine.name,
    todayOrderQuantity,
    todayOrderId: todayOrder._id.toString(),
  }
}
