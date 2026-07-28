import { ObjectId } from 'mongodb'

import { OrderStatus } from '../../../order/order-status.enum'
import { normalizeRouteTemplateName } from '../../../route-templates/route-template.utils'
import { RouteStatus } from '../../../routes/route-status.enum'
import { UserRole } from '../../../user/user-role.enum'
import {
  ANALYTICS_DEMO_COURIER_COUNT,
  ANALYTICS_DEMO_GENERATED_BY_USER_ID,
  analyticsDemoDisplayName,
  analyticsDemoEmail,
  analyticsDemoFirebaseUid,
  analyticsDemoObjectId,
  analyticsDemoTemplateName,
  analyticsDemoVehicleLabel,
} from './courier-analytics-demo.constants'

export type AnalyticsDemoMode = 'dry-run' | 'apply' | 'cleanup'

export type AnalyticsDemoCourierPersona =
  | 'elite'
  | 'strong'
  | 'average'
  | 'inconsistent'
  | 'slow'
  | 'adminProof'
  | 'incompleteHeavy'
  | 'cancelledHeavy'
  | 'sparse'
  | 'volume'

export type AnalyticsDemoStopDoc = {
  stopId: string
  sequence: number
  apothekerProfileId: string
  apothekerUserId: string
  pharmacyName: string
  address: {
    street: string
    houseNumber: string
    postalCode: string
    city: string
    country: string
  }
  orderIds: string[]
  orderCount: number
  totalQuantity: number
  lines: Array<{
    vaccineId: string
    vaccineName: string
    manufacturer: string
    quantity: number
  }>
  arrival?: { recordedAt: Date; recordedByUserId: string } | null
  deliveryProof?: {
    method: 'QR' | 'ADMIN'
    deliveredAt: Date
    deliveredByUserId: string
    associatedOrderIds: string[]
    recipientProfileId: string
    recipientCity: string
  } | null
  confirmationProcess?: { state: 'PROCESSING' | 'COMPLETED' } | null
}

export type AnalyticsDemoRouteDoc = {
  _id: ObjectId
  routeTemplateId: string
  bezorgerProfileId: string
  deliveryDate: string
  status: RouteStatus
  stops: AnalyticsDemoStopDoc[]
  skippedApothekerProfileIds: string[]
  statusHistory: Array<{
    fromStatus: RouteStatus | null
    toStatus: RouteStatus
    changedAt: Date
    changedByUserId: string
  }>
  generatedAt: Date
  generatedByUserId: string
  createdAt: Date
  updatedAt: Date
}

export type AnalyticsDemoUserDoc = {
  _id: ObjectId
  firebaseUid: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  createdAt: Date
  updatedAt: Date
}

export type AnalyticsDemoProfileDoc = {
  _id: ObjectId
  userId: string
  displayName: string
  vehicleLabel: string
  createdAt: Date
  updatedAt: Date
}

export type AnalyticsDemoTemplateDoc = {
  _id: ObjectId
  name: string
  normalizedName: string
  description: string
  active: boolean
  bezorgerProfileId: string
  stops: Array<{
    sequence: number
    apothekerProfileId: string
  }>
  createdAt: Date
  updatedAt: Date
  createdByUserId: string
  updatedByUserId: string
}

export type AnalyticsDemoOrderDoc = {
  _id: ObjectId
  apothekerId: string
  status: OrderStatus
  orderLines: Array<{
    vaccineId: string
    vaccineName: string
    manufacturer: string
    quantity: number
  }>
  totalQuantity: number
  isoWeek: number
  isoYear: number
  submittedAt: Date
  deliveryDate: string
  cancelledAt: Date | null
  deliveredAt: Date | null
  deliveredByUserId: string | null
  deliveryMethod: 'QR' | 'ADMIN' | null
  statusHistory: Array<{
    fromStatus: OrderStatus | null
    toStatus: OrderStatus
    changedAt: Date
    changedByUserId: string
    reason?: string | null
  }>
  createdAt: Date
  updatedAt: Date
}

export type AnalyticsDemoPlan = {
  mode: AnalyticsDemoMode
  now: Date
  dateFrom: string
  dateTo: string
  couriers: Array<{
    index: number
    persona: AnalyticsDemoCourierPersona
    email: string
    displayName: string
    user: AnalyticsDemoUserDoc
    profile: AnalyticsDemoProfileDoc
    template: AnalyticsDemoTemplateDoc
  }>
  routes: AnalyticsDemoRouteDoc[]
  orders: AnalyticsDemoOrderDoc[]
  summary: {
    courierCount: number
    routeCount: number
    stopCount: number
    orderCount: number
    completedRouteCount: number
    cancelledRouteCount: number
    incompleteRouteCount: number
  }
}

const PERSONAS: AnalyticsDemoCourierPersona[] = [
  'elite',
  'strong',
  'average',
  'inconsistent',
  'slow',
  'adminProof',
  'incompleteHeavy',
  'cancelledHeavy',
  'sparse',
  'volume',
]

const PHARMACIES = [
  {
    name: 'Stat Pharmacy Noord',
    city: 'Brugge',
    postalCode: '8000',
    street: 'Noordstraat',
  },
  {
    name: 'Stat Pharmacy Zuid',
    city: 'Kortrijk',
    postalCode: '8500',
    street: 'Zuidlaan',
  },
  {
    name: 'Stat Pharmacy Centrum',
    city: 'Gent',
    postalCode: '9000',
    street: 'Korenmarkt',
  },
] as const

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = pad2(date.getMonth() + 1)
  const d = pad2(date.getDate())
  return `${y}-${m}-${d}`
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  d.setDate(d.getDate() + days)
  return d
}

function isoWeekYear(date: Date): { isoWeek: number; isoYear: number } {
  const tmp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  )
  const dayNum = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const isoWeek = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  )
  return { isoWeek, isoYear: tmp.getUTCFullYear() }
}

function atLocalTime(dateYmd: string, hour: number, minute: number): Date {
  const parts = dateYmd.split('-').map(part => Number(part))
  const year = parts[0] ?? Number.NaN
  const month = parts[1] ?? Number.NaN
  const day = parts[2] ?? Number.NaN
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

type RouteBlueprint = {
  dayOffset: number
  status: RouteStatus
  stopCount: number
  late: boolean
  proofMethod: 'QR' | 'ADMIN'
  abandonedProcessing?: boolean
  missingArrival?: boolean
  dosesPerStop: number
}

function blueprintsForPersona(
  persona: AnalyticsDemoCourierPersona,
): RouteBlueprint[] {
  switch (persona) {
    case 'elite':
      return Array.from({ length: 22 }, (_, i) => ({
        dayOffset: 2 + i * 4,
        status: RouteStatus.COMPLETED,
        stopCount: 3,
        late: false,
        proofMethod: 'QR' as const,
        dosesPerStop: 12 + (i % 4),
      }))
    case 'strong':
      return Array.from({ length: 18 }, (_, i) => ({
        dayOffset: 3 + i * 5,
        status:
          i % 9 === 0 ? RouteStatus.CANCELLED : RouteStatus.COMPLETED,
        stopCount: 2 + (i % 2),
        late: i % 7 === 0,
        proofMethod: i % 5 === 0 ? ('ADMIN' as const) : ('QR' as const),
        dosesPerStop: 10 + (i % 5),
      }))
    case 'average':
      return Array.from({ length: 16 }, (_, i) => ({
        dayOffset: 1 + i * 5,
        status:
          i % 5 === 0
            ? RouteStatus.CANCELLED
            : i % 8 === 0
              ? RouteStatus.ASSIGNED
              : RouteStatus.COMPLETED,
        stopCount: 2,
        late: i % 4 === 0,
        proofMethod: i % 3 === 0 ? ('ADMIN' as const) : ('QR' as const),
        dosesPerStop: 8 + (i % 3),
        abandonedProcessing: i % 8 === 0,
      }))
    case 'inconsistent':
      return Array.from({ length: 14 }, (_, i) => ({
        dayOffset: 4 + i * 6,
        status:
          i % 3 === 0
            ? RouteStatus.IN_PROGRESS
            : i % 4 === 0
              ? RouteStatus.CANCELLED
              : RouteStatus.COMPLETED,
        stopCount: 2 + (i % 2),
        late: true,
        proofMethod: 'QR' as const,
        dosesPerStop: 6 + (i % 4),
        abandonedProcessing: i % 3 === 0,
        missingArrival: i % 5 === 0,
      }))
    case 'slow':
      return Array.from({ length: 15 }, (_, i) => ({
        dayOffset: 2 + i * 5,
        status: i % 6 === 0 ? RouteStatus.CANCELLED : RouteStatus.COMPLETED,
        stopCount: 2,
        late: true,
        proofMethod: i % 2 === 0 ? ('QR' as const) : ('ADMIN' as const),
        dosesPerStop: 9,
        missingArrival: false,
      })).map(bp => ({ ...bp, late: bp.status === RouteStatus.COMPLETED }))
    case 'adminProof':
      return Array.from({ length: 14 }, (_, i) => ({
        dayOffset: 5 + i * 6,
        status: RouteStatus.COMPLETED,
        stopCount: 2,
        late: i % 5 === 0,
        proofMethod: 'ADMIN' as const,
        dosesPerStop: 11,
      }))
    case 'incompleteHeavy':
      return Array.from({ length: 16 }, (_, i) => ({
        dayOffset: 3 + i * 5,
        status:
          i < 10
            ? RouteStatus.ASSIGNED
            : i % 2 === 0
              ? RouteStatus.COMPLETED
              : RouteStatus.CANCELLED,
        stopCount: 2,
        late: false,
        proofMethod: 'QR' as const,
        dosesPerStop: 7,
        abandonedProcessing: i < 10,
      }))
    case 'cancelledHeavy':
      return Array.from({ length: 14 }, (_, i) => ({
        dayOffset: 2 + i * 6,
        status: i % 3 === 0 ? RouteStatus.COMPLETED : RouteStatus.CANCELLED,
        stopCount: 2,
        late: false,
        proofMethod: 'QR' as const,
        dosesPerStop: 8,
      }))
    case 'sparse':
      return Array.from({ length: 5 }, (_, i) => ({
        dayOffset: 10 + i * 14,
        status: RouteStatus.COMPLETED,
        stopCount: 1,
        late: false,
        proofMethod: 'QR' as const,
        dosesPerStop: 20,
      }))
    case 'volume':
      return Array.from({ length: 28 }, (_, i) => ({
        dayOffset: 1 + i * 3,
        status:
          i % 10 === 0 ? RouteStatus.CANCELLED : RouteStatus.COMPLETED,
        stopCount: 3 + (i % 2),
        late: i % 6 === 0,
        proofMethod: i % 4 === 0 ? ('ADMIN' as const) : ('QR' as const),
        dosesPerStop: 14 + (i % 6),
      }))
  }
}

function buildStop(params: {
  courierIndex: number
  routeIndex: number
  stopIndex: number
  deliveryDate: string
  courierUserId: string
  blueprint: RouteBlueprint
  includeDelivery: boolean
}): { stop: AnalyticsDemoStopDoc; order: AnalyticsDemoOrderDoc | null } {
  const pharmacy =
    PHARMACIES[params.stopIndex % PHARMACIES.length] ?? PHARMACIES[0]
  const orderId = analyticsDemoObjectId(
    'order',
    params.courierIndex * 1000 + params.routeIndex * 10 + params.stopIndex,
  )
  const stopObjectId = analyticsDemoObjectId(
    'stop',
    params.courierIndex * 1000 + params.routeIndex * 10 + params.stopIndex,
  )
  const apothekerUserId = analyticsDemoObjectId(
    'user',
    100 + (params.stopIndex % PHARMACIES.length),
  ).toString()
  const apothekerProfileId = analyticsDemoObjectId(
    'profile',
    100 + (params.stopIndex % PHARMACIES.length),
  ).toString()

  const quantity = params.blueprint.dosesPerStop
  const lines = [
    {
      vaccineId: analyticsDemoObjectId('order', 9000).toString(),
      vaccineName: 'Influenza',
      manufacturer: 'Demo Pharma',
      quantity,
    },
  ]

  const arrivalAt = atLocalTime(params.deliveryDate, 8 + params.stopIndex, 15)
  const deliveredAt = params.blueprint.late
    ? atLocalTime(
        toLocalDateString(addDays(new Date(params.deliveryDate), 1)),
        10 + params.stopIndex,
        30,
      )
    : atLocalTime(params.deliveryDate, 9 + params.stopIndex, 45)

  const stop: AnalyticsDemoStopDoc = {
    stopId: stopObjectId.toString(),
    sequence: params.stopIndex + 1,
    apothekerProfileId,
    apothekerUserId,
    pharmacyName: pharmacy.name,
    address: {
      street: pharmacy.street,
      houseNumber: String(10 + params.stopIndex),
      postalCode: pharmacy.postalCode,
      city: pharmacy.city,
      country: 'BE',
    },
    orderIds: [orderId.toString()],
    orderCount: 1,
    totalQuantity: quantity,
    lines,
  }

  if (params.includeDelivery) {
    if (!params.blueprint.missingArrival) {
      stop.arrival = {
        recordedAt: arrivalAt,
        recordedByUserId: params.courierUserId,
      }
    }
    stop.deliveryProof = {
      method: params.blueprint.proofMethod,
      deliveredAt,
      deliveredByUserId: params.courierUserId,
      associatedOrderIds: [orderId.toString()],
      recipientProfileId: apothekerProfileId,
      recipientCity: pharmacy.city,
    }
    stop.confirmationProcess = { state: 'COMPLETED' }
  } else if (params.blueprint.abandonedProcessing) {
    stop.confirmationProcess = { state: 'PROCESSING' }
  }

  const order: AnalyticsDemoOrderDoc | null = params.includeDelivery
    ? {
        _id: orderId,
        apothekerId: apothekerUserId,
        status: OrderStatus.DELIVERED,
        orderLines: lines,
        totalQuantity: quantity,
        ...isoWeekYear(new Date(params.deliveryDate)),
        submittedAt: atLocalTime(params.deliveryDate, 7, 0),
        deliveryDate: params.deliveryDate,
        cancelledAt: null,
        deliveredAt,
        deliveredByUserId: params.courierUserId,
        deliveryMethod: params.blueprint.proofMethod,
        statusHistory: [
          {
            fromStatus: OrderStatus.PENDING,
            toStatus: OrderStatus.DELIVERED,
            changedAt: deliveredAt,
            changedByUserId: params.courierUserId,
          },
        ],
        createdAt: atLocalTime(params.deliveryDate, 7, 0),
        updatedAt: deliveredAt,
      }
    : {
        _id: orderId,
        apothekerId: apothekerUserId,
        status:
          params.blueprint.status === RouteStatus.CANCELLED
            ? OrderStatus.CANCELLED
            : OrderStatus.PLANNED,
        orderLines: lines,
        totalQuantity: quantity,
        ...isoWeekYear(new Date(params.deliveryDate)),
        submittedAt: atLocalTime(params.deliveryDate, 7, 0),
        deliveryDate: params.deliveryDate,
        cancelledAt:
          params.blueprint.status === RouteStatus.CANCELLED
            ? atLocalTime(params.deliveryDate, 11, 0)
            : null,
        deliveredAt: null,
        deliveredByUserId: null,
        deliveryMethod: null,
        statusHistory: [
          {
            fromStatus: OrderStatus.PENDING,
            toStatus:
              params.blueprint.status === RouteStatus.CANCELLED
                ? OrderStatus.CANCELLED
                : OrderStatus.PLANNED,
            changedAt: atLocalTime(params.deliveryDate, 11, 0),
            changedByUserId: ANALYTICS_DEMO_GENERATED_BY_USER_ID,
            reason:
              params.blueprint.status === RouteStatus.CANCELLED
                ? 'Analytics demo cancellation'
                : null,
          },
        ],
        createdAt: atLocalTime(params.deliveryDate, 7, 0),
        updatedAt: atLocalTime(params.deliveryDate, 11, 0),
      }

  return { stop, order }
}

/**
 * Build a deterministic analytics demo dataset spanning ~90 days ending at `now`.
 * Database-only: synthetic Firebase UIDs, no Auth provisioning.
 */
export function buildAnalyticsDemoPlan(options: {
  mode: AnalyticsDemoMode
  now?: Date
}): AnalyticsDemoPlan {
  const now = options.now ?? new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dateTo = toLocalDateString(addDays(today, -1))
  const dateFrom = toLocalDateString(addDays(today, -90))
  const createdAt = now

  const couriers = []
  const routes: AnalyticsDemoRouteDoc[] = []
  const orders: AnalyticsDemoOrderDoc[] = []
  let routeSeq = 0
  let completedRouteCount = 0
  let cancelledRouteCount = 0
  let incompleteRouteCount = 0
  let stopCount = 0

  for (let i = 0; i < ANALYTICS_DEMO_COURIER_COUNT; i += 1) {
    const oneBased = i + 1
    const persona = PERSONAS[i] ?? 'average'
    const userId = analyticsDemoObjectId('user', i)
    const profileId = analyticsDemoObjectId('profile', i)
    const templateId = analyticsDemoObjectId('template', i)
    const email = analyticsDemoEmail(oneBased)
    const displayName = analyticsDemoDisplayName(oneBased)

    const user: AnalyticsDemoUserDoc = {
      _id: userId,
      firebaseUid: analyticsDemoFirebaseUid(oneBased),
      email,
      firstName: 'Courier',
      lastName: `Stat ${pad2(oneBased)}`,
      role: UserRole.BEZORGER,
      createdAt,
      updatedAt: createdAt,
    }

    const profile: AnalyticsDemoProfileDoc = {
      _id: profileId,
      userId: userId.toString(),
      displayName,
      vehicleLabel: analyticsDemoVehicleLabel(oneBased),
      createdAt,
      updatedAt: createdAt,
    }

    const template: AnalyticsDemoTemplateDoc = {
      _id: templateId,
      name: analyticsDemoTemplateName(oneBased),
      normalizedName: normalizeRouteTemplateName(
        analyticsDemoTemplateName(oneBased),
      ),
      description: `Inactive analytics demo template for ${displayName}`,
      // Inactive to avoid colliding with the active-owner unique index.
      active: false,
      bezorgerProfileId: profileId.toString(),
      stops: PHARMACIES.map((pharmacy, sequence) => ({
        sequence: sequence + 1,
        apothekerProfileId: analyticsDemoObjectId(
          'profile',
          100 + sequence,
        ).toString(),
      })),
      createdAt,
      updatedAt: createdAt,
      createdByUserId: ANALYTICS_DEMO_GENERATED_BY_USER_ID,
      updatedByUserId: ANALYTICS_DEMO_GENERATED_BY_USER_ID,
    }

    couriers.push({
      index: oneBased,
      persona,
      email,
      displayName,
      user,
      profile,
      template,
    })

    const blueprints = blueprintsForPersona(persona)
    for (let r = 0; r < blueprints.length; r += 1) {
      const blueprint = blueprints[r]
      if (!blueprint) {
        continue
      }
      const deliveryDate = toLocalDateString(
        addDays(today, -blueprint.dayOffset),
      )
      if (deliveryDate < dateFrom || deliveryDate > dateTo) {
        continue
      }

      const includeDelivery = blueprint.status === RouteStatus.COMPLETED
      const routeStops: AnalyticsDemoStopDoc[] = []
      for (let s = 0; s < blueprint.stopCount; s += 1) {
        const built = buildStop({
          courierIndex: i,
          routeIndex: r,
          stopIndex: s,
          deliveryDate,
          courierUserId: userId.toString(),
          blueprint,
          includeDelivery,
        })
        routeStops.push(built.stop)
        if (built.order) {
          orders.push(built.order)
        }
        stopCount += 1
      }

      const routeId = analyticsDemoObjectId('route', routeSeq)
      routeSeq += 1
      const generatedAt = atLocalTime(deliveryDate, 6, 0)
      routes.push({
        _id: routeId,
        routeTemplateId: templateId.toString(),
        bezorgerProfileId: profileId.toString(),
        deliveryDate,
        status: blueprint.status,
        stops: routeStops,
        skippedApothekerProfileIds: [],
        statusHistory: [
          {
            fromStatus: null,
            toStatus: RouteStatus.ASSIGNED,
            changedAt: generatedAt,
            changedByUserId: ANALYTICS_DEMO_GENERATED_BY_USER_ID,
          },
          ...(blueprint.status !== RouteStatus.ASSIGNED
            ? [
                {
                  fromStatus: RouteStatus.ASSIGNED,
                  toStatus: blueprint.status,
                  changedAt: atLocalTime(deliveryDate, 12, 0),
                  changedByUserId: ANALYTICS_DEMO_GENERATED_BY_USER_ID,
                },
              ]
            : []),
        ],
        generatedAt,
        generatedByUserId: ANALYTICS_DEMO_GENERATED_BY_USER_ID,
        createdAt: generatedAt,
        updatedAt: atLocalTime(deliveryDate, 12, 0),
      })

      if (blueprint.status === RouteStatus.COMPLETED) {
        completedRouteCount += 1
      } else if (blueprint.status === RouteStatus.CANCELLED) {
        cancelledRouteCount += 1
      } else {
        incompleteRouteCount += 1
      }
    }
  }

  return {
    mode: options.mode,
    now,
    dateFrom,
    dateTo,
    couriers,
    routes,
    orders,
    summary: {
      courierCount: couriers.length,
      routeCount: routes.length,
      stopCount,
      orderCount: orders.length,
      completedRouteCount,
      cancelledRouteCount,
      incompleteRouteCount,
    },
  }
}

export function formatAnalyticsDemoPlanSummary(
  plan: AnalyticsDemoPlan,
  dbName: string,
): string {
  const lines = [
    `Analytics demo data (${plan.mode})`,
    `- database: ${dbName}`,
    `- couriers: ${plan.summary.courierCount}`,
    `- routes: ${plan.summary.routeCount} (completed ${plan.summary.completedRouteCount}, cancelled ${plan.summary.cancelledRouteCount}, incomplete/active ${plan.summary.incompleteRouteCount})`,
    `- stops: ${plan.summary.stopCount}`,
    `- orders: ${plan.summary.orderCount}`,
    `- date range: ${plan.dateFrom} → ${plan.dateTo}`,
    `- mode: ${plan.mode}`,
  ]
  return lines.join('\n')
}
