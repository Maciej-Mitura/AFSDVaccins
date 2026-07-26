import { ObjectId } from 'mongodb'

import { UserRole } from '../../user/user-role.enum'
import { RouteStatus } from '../route-status.enum'
import { DeliveryStopArrivalService } from './delivery-stop-arrival.service'
import {
  DeliveryArrivalAlreadyRecordedException,
  DeliveryArrivalForbiddenException,
  DeliveryArrivalRouteInactiveException,
  DeliveryArrivalRouteNotStartedException,
  DeliveryArrivalStopAlreadyDeliveredException,
  DeliveryArrivalStopNotFoundException,
  DeliveryArrivalTimestampInvalidException,
} from './delivery-stop-arrival.exceptions'
import { StopArrivalSource } from './stop-arrival-source.enum'

describe('DeliveryStopArrivalService', () => {
  const courierUserId = new ObjectId()
  const pharmacyUserId = new ObjectId()
  const pharmacyProfileId = new ObjectId().toString()
  const bezorgerProfileId = new ObjectId()
  const routeId = new ObjectId()
  const stopId = 'stop-arrival-1'
  const idempotencyKey = 'idem-arrival-key-001'

  const actor = {
    _id: courierUserId,
    role: UserRole.BEZORGER,
  } as never

  function buildRoute(overrides?: {
    status?: RouteStatus
    delivered?: boolean
    arrival?: {
      clientArrivedAt: Date
      recordedAt: Date
      arrivedByUserId: string
      arrivedByBezorgerProfileId: string
      source: StopArrivalSource
      idempotencyKey: string
    } | null
    stopId?: string | null
  }) {
    return {
      _id: routeId,
      status: overrides?.status ?? RouteStatus.IN_PROGRESS,
      bezorgerProfileId,
      deliveryDate: '2026-07-26',
      stops: [
        {
          stopId:
            overrides?.stopId === null
              ? undefined
              : (overrides?.stopId ?? stopId),
          sequence: 1,
          apothekerProfileId: pharmacyProfileId,
          apothekerUserId: pharmacyUserId.toString(),
          pharmacyName: 'Test Apotheek',
          address: {
            street: 'Markt',
            houseNumber: '1',
            postalCode: '8000',
            city: 'Brugge',
            country: 'BE',
          },
          orderIds: ['order-1'],
          orderCount: 1,
          totalQuantity: 3,
          lines: [],
          qrConfirmation: null,
          deliveryProof: overrides?.delivered
            ? {
                method: 'QR',
                deliveredAt: new Date('2026-07-26T11:00:00.000Z'),
                deliveredByUserId: courierUserId.toString(),
                associatedOrderIds: ['order-1'],
                recipientProfileId: pharmacyProfileId,
                recipientCity: 'Brugge',
              }
            : null,
          confirmationProcess: null,
          arrival: overrides?.arrival ?? null,
        },
      ],
    }
  }

  function buildService(deps: {
    route?: ReturnType<typeof buildRoute> | null
    profileId?: string
    actorRole?: UserRole
    findOneAndUpdateResult?: ReturnType<typeof buildRoute> | null
    auditInserted?: boolean
    priorAudit?: {
      routeId: string
      stopId: string
      courierUserId: string
      idempotencyKey: string
    } | null
  }) {
    const route = deps.route === undefined ? buildRoute() : deps.route
    let currentRoute = route

    const deliveryRouteRepository = {
      findOne: jest
        .fn()
        .mockImplementation(() => Promise.resolve(currentRoute)),
      updateOne: jest.fn().mockImplementation((_filter, update) => {
        if (deps.findOneAndUpdateResult === null) {
          return Promise.resolve({ modifiedCount: 0 })
        }
        const set = (update as { $set?: { 'stops.$.arrival'?: unknown } }).$set
        if (currentRoute && set?.['stops.$.arrival']) {
          currentRoute = {
            ...currentRoute,
            stops: [
              {
                ...currentRoute.stops[0],
                arrival: set[
                  'stops.$.arrival'
                ] as (typeof currentRoute.stops)[0]['arrival'],
              },
            ],
          }
        }
        if (deps.findOneAndUpdateResult !== undefined) {
          currentRoute = deps.findOneAndUpdateResult
        }
        return Promise.resolve({ modifiedCount: 1 })
      }),
      findOneAndUpdate: jest.fn(),
    }

    const publishBezorgerRouteUpdated = jest.fn().mockResolvedValue(undefined)
    const auditRecord = jest.fn().mockResolvedValue({
      inserted: deps.auditInserted ?? true,
      existing: null,
    })
    const findByActorAndKey = jest
      .fn()
      .mockResolvedValue(deps.priorAudit ?? null)
    const recordArrivalLocation = jest.fn().mockImplementation(
      (input: { route: typeof currentRoute }) =>
        Promise.resolve({
          route: input.route,
          applied: true,
          location: null,
          nextStop: null,
          published: false,
        }),
    )

    const service = new DeliveryStopArrivalService(
      deliveryRouteRepository as never,
      {
        findByUserId: jest.fn().mockResolvedValue({
          id: deps.profileId ?? bezorgerProfileId,
        }),
      } as never,
      { publishBezorgerRouteUpdated } as never,
      { record: auditRecord, findByActorAndKey } as never,
      { recordArrivalLocation } as never,
    )

    return {
      service,
      deliveryRouteRepository,
      publishBezorgerRouteUpdated,
      auditRecord,
      recordArrivalLocation,
      actor:
        deps.actorRole === undefined
          ? actor
          : ({ _id: courierUserId, role: deps.actorRole } as never),
    }
  }

  const body = {
    clientArrivedAt: '2026-07-26T10:30:00.000Z',
    idempotencyKey,
  }

  it('assigned courier records arrival with both timestamps', async () => {
    const {
      service,
      publishBezorgerRouteUpdated,
      auditRecord,
      actor: a,
    } = buildService({})

    const result = await service.recordArrivalForCourier(
      a,
      routeId.toString(),
      stopId,
      body,
    )

    expect(result.routeId).toBe(routeId.toString())
    expect(result.stopId).toBe(stopId)
    expect(result.clientArrivedAt).toBe('2026-07-26T10:30:00.000Z')
    expect(result.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.arrivedByUserId).toBe(courierUserId.toString())
    expect(result.arrivalStatus).toBe('RECORDED')
    expect(result).not.toHaveProperty('idempotencyKey')
    expect(result).not.toHaveProperty('encodedToken')
    expect(auditRecord).toHaveBeenCalledTimes(1)
    expect(publishBezorgerRouteUpdated).toHaveBeenCalledTimes(1)
  })

  it('rejects ADMIN and APOTHEKER', async () => {
    for (const role of [UserRole.ADMIN, UserRole.APOTHEKER]) {
      const { service, actor: a } = buildService({ actorRole: role })
      await expect(
        service.recordArrivalForCourier(a, routeId.toString(), stopId, body),
      ).rejects.toBeInstanceOf(DeliveryArrivalForbiddenException)
    }
  })

  it('rejects unrelated courier', async () => {
    const { service, actor: a } = buildService({
      profileId: new ObjectId().toString(),
    })
    await expect(
      service.recordArrivalForCourier(a, routeId.toString(), stopId, body),
    ).rejects.toBeInstanceOf(DeliveryArrivalForbiddenException)
  })

  it('rejects ASSIGNED route', async () => {
    const { service, actor: a } = buildService({
      route: buildRoute({ status: RouteStatus.ASSIGNED }),
    })
    await expect(
      service.recordArrivalForCourier(a, routeId.toString(), stopId, body),
    ).rejects.toBeInstanceOf(DeliveryArrivalRouteNotStartedException)
  })

  it('rejects COMPLETED and CANCELLED routes', async () => {
    for (const status of [RouteStatus.COMPLETED, RouteStatus.CANCELLED]) {
      const { service, actor: a } = buildService({
        route: buildRoute({ status }),
      })
      await expect(
        service.recordArrivalForCourier(a, routeId.toString(), stopId, body),
      ).rejects.toBeInstanceOf(DeliveryArrivalRouteInactiveException)
    }
  })

  it('rejects missing stop', async () => {
    const { service, actor: a } = buildService({})
    await expect(
      service.recordArrivalForCourier(
        a,
        routeId.toString(),
        'missing-stop',
        body,
      ),
    ).rejects.toBeInstanceOf(DeliveryArrivalStopNotFoundException)
  })

  it('rejects delivered stop without writing arrival', async () => {
    const {
      service,
      actor: a,
      auditRecord,
      publishBezorgerRouteUpdated,
    } = buildService({
      route: buildRoute({ delivered: true }),
    })
    await expect(
      service.recordArrivalForCourier(a, routeId.toString(), stopId, body),
    ).rejects.toBeInstanceOf(DeliveryArrivalStopAlreadyDeliveredException)
    expect(auditRecord).not.toHaveBeenCalled()
    expect(publishBezorgerRouteUpdated).not.toHaveBeenCalled()
  })

  it('rejects future and implausibly old timestamps', async () => {
    const { service, actor: a } = buildService({})
    await expect(
      service.recordArrivalForCourier(a, routeId.toString(), stopId, {
        clientArrivedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(DeliveryArrivalTimestampInvalidException)

    await expect(
      service.recordArrivalForCourier(a, routeId.toString(), stopId, {
        clientArrivedAt: '2026-07-20T10:00:00.000Z',
        idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(DeliveryArrivalTimestampInvalidException)
  })

  it('same idempotency key returns existing arrival without new events', async () => {
    const existing = {
      clientArrivedAt: new Date('2026-07-26T10:30:00.000Z'),
      recordedAt: new Date('2026-07-26T10:31:00.000Z'),
      arrivedByUserId: courierUserId.toString(),
      arrivedByBezorgerProfileId: bezorgerProfileId.toString(),
      source: StopArrivalSource.COURIER,
      idempotencyKey,
    }
    const {
      service,
      actor: a,
      auditRecord,
      publishBezorgerRouteUpdated,
    } = buildService({
      route: buildRoute({ arrival: existing }),
    })

    const result = await service.recordArrivalForCourier(
      a,
      routeId.toString(),
      stopId,
      body,
    )

    expect(result.recordedAt).toBe(existing.recordedAt.toISOString())
    expect(auditRecord).not.toHaveBeenCalled()
    expect(publishBezorgerRouteUpdated).not.toHaveBeenCalled()
  })

  it('different key after arrival returns already recorded', async () => {
    const { service, actor: a } = buildService({
      route: buildRoute({
        arrival: {
          clientArrivedAt: new Date('2026-07-26T10:30:00.000Z'),
          recordedAt: new Date('2026-07-26T10:31:00.000Z'),
          arrivedByUserId: courierUserId.toString(),
          arrivedByBezorgerProfileId: bezorgerProfileId.toString(),
          source: StopArrivalSource.COURIER,
          idempotencyKey: 'other-key-already-used',
        },
      }),
    })

    await expect(
      service.recordArrivalForCourier(a, routeId.toString(), stopId, body),
    ).rejects.toBeInstanceOf(DeliveryArrivalAlreadyRecordedException)
  })

  it('persists actor and profile on first write', async () => {
    const { service, actor: a, deliveryRouteRepository } = buildService({})

    await service.recordArrivalForCourier(a, routeId.toString(), stopId, body)

    const updateCall = deliveryRouteRepository.updateOne.mock.calls[0] as
      | [
          unknown,
          {
            $set: {
              'stops.$.arrival': {
                arrivedByUserId: string
                arrivedByBezorgerProfileId: string
                source: StopArrivalSource
                idempotencyKey: string
              }
            }
          },
        ]
      | undefined
    expect(updateCall).toBeDefined()
    const writtenArrival = updateCall![1].$set['stops.$.arrival']
    expect(writtenArrival.arrivedByUserId).toBe(courierUserId.toString())
    expect(writtenArrival.arrivedByBezorgerProfileId).toBe(
      bezorgerProfileId.toString(),
    )
    expect(writtenArrival.source).toBe(StopArrivalSource.COURIER)
    expect(writtenArrival.idempotencyKey).toBe(idempotencyKey)
  })
})
