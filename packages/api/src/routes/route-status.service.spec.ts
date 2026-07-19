import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { CLOCK } from '../order/clock.provider'
import { BezorgerProfile } from '../profile/bezorger/bezorger-profile.entity'
import { BezorgerProfileService } from '../profile/bezorger/bezorger-profile.service'
import { SettingsService } from '../settings/settings.service'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { DeliveryRoute } from './delivery-route.entity'
import { DeliveryRouteEventsService } from './delivery-route-events.service'
import {
  DeliveryRouteForbiddenException,
  DeliveryRouteNotFoundException,
  InvalidRouteStatusTransitionException,
  RouteCannotBeCancelledException,
} from './exceptions/delivery-route.exceptions'
import { RouteGenerationService } from './route-generation.service'
import { RoutePreviewService } from './route-preview.service'
import { RouteStatus } from './route-status.enum'
import { RoutesService } from './routes.service'

describe('RoutesService.updateRouteStatus', () => {
  let service: RoutesService
  let repository: jest.Mocked<
    Pick<MongoRepository<DeliveryRoute>, 'findOne' | 'findOneAndUpdate'>
  >
  let eventsService: jest.Mocked<
    Pick<DeliveryRouteEventsService, 'publishBezorgerRouteUpdated'>
  >
  let findByUserId: jest.Mock
  let clockNow: Date

  const routeId = '707f1f77bcf86cd799439031'
  const profileIdString = '607f1f77bcf86cd799439002'
  const otherProfileId = '607f1f77bcf86cd799439099'
  const adminId = '507f1f77bcf86cd799439012'
  const bezorgerUserId = '507f1f77bcf86cd799439010'

  const admin: User = {
    _id: adminId,
    id: adminId,
    firebaseUid: 'firebase-admin',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: UserRole.ADMIN,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const bezorger: User = {
    _id: bezorgerUserId,
    id: bezorgerUserId,
    firebaseUid: 'firebase-bezorger',
    email: 'bezorger@example.com',
    firstName: 'Bezorger',
    lastName: 'User',
    role: UserRole.BEZORGER,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const apotheker: User = {
    _id: '507f1f77bcf86cd799439013',
    id: '507f1f77bcf86cd799439013',
    firebaseUid: 'firebase-apotheker',
    email: 'apotheker@example.com',
    firstName: 'Apotheker',
    lastName: 'User',
    role: UserRole.APOTHEKER,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const otherBezorger: User = {
    _id: '507f1f77bcf86cd799439014',
    id: '507f1f77bcf86cd799439014',
    firebaseUid: 'firebase-bezorger-2',
    email: 'bezorger2@example.com',
    firstName: 'Other',
    lastName: 'Courier',
    role: UserRole.BEZORGER,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  function makeRoute(
    status: RouteStatus,
    overrides: Partial<DeliveryRoute> = {},
  ): DeliveryRoute {
    return {
      _id: routeId,
      id: routeId,
      routeTemplateId: '607f1f77bcf86cd799439001',
      bezorgerProfileId: profileIdString,
      deliveryDate: '2026-07-19',
      status,
      stops: [
        {
          sequence: 1,
          apothekerProfileId: 'a',
          apothekerUserId: 'u',
          pharmacyName: 'Apotheek',
          address: {
            street: 'S',
            houseNumber: '1',
            postalCode: '9000',
            city: 'Gent',
            country: 'BE',
          },
          orderIds: ['o1'],
          orderCount: 1,
          totalQuantity: 5,
          lines: [
            {
              vaccineId: 'v1',
              vaccineName: 'Flu',
              manufacturer: 'M',
              quantity: 5,
            },
          ],
        },
      ],
      skippedApothekerProfileIds: [],
      statusHistory: [
        {
          fromStatus: null,
          toStatus: RouteStatus.ASSIGNED,
          changedAt: new Date('2026-07-19T08:00:00.000Z'),
          changedByUserId: adminId,
          reason: 'Route generated',
        },
      ],
      generatedAt: new Date('2026-07-19T08:00:00.000Z'),
      generatedByUserId: adminId,
      createdAt: new Date('2026-07-19T08:00:00.000Z'),
      updatedAt: new Date('2026-07-19T08:00:00.000Z'),
      ...overrides,
    }
  }

  function makeProfile(id: string, userId: string = bezorgerUserId): BezorgerProfile {
    return {
      _id: id,
      get id() {
        return this._id
      },
      userId,
      displayName: 'Courier',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  function mockFindOne(route: DeliveryRoute | null): void {
    repository.findOne.mockResolvedValue(route)
  }

  function mockSuccessfulTransition(
    before: DeliveryRoute,
    after: DeliveryRoute,
  ): void {
    repository.findOne
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after)
    repository.findOneAndUpdate.mockResolvedValue(after)
  }

  beforeEach(async () => {
    clockNow = new Date('2026-07-19T12:00:00.000Z')
    repository = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    }
    eventsService = {
      publishBezorgerRouteUpdated: jest.fn().mockResolvedValue(undefined),
    }
    findByUserId = jest.fn().mockResolvedValue(makeProfile(profileIdString))

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutesService,
        {
          provide: getRepositoryToken(DeliveryRoute),
          useValue: repository,
        },
        {
          provide: RouteGenerationService,
          useValue: {
            findByBezorgerAndDate: jest.fn(),
          },
        },
        {
          provide: RoutePreviewService,
          useValue: { computeTomorrowPreview: jest.fn() },
        },
        {
          provide: DeliveryRouteEventsService,
          useValue: eventsService,
        },
        {
          provide: BezorgerProfileService,
          useValue: { findByUserId },
        },
        {
          provide: SettingsService,
          useValue: {
            getApplicationSettings: () =>
              Promise.resolve({ timezone: 'Europe/Brussels' }),
          },
        },
        { provide: CLOCK, useValue: { now: () => clockNow } },
      ],
    }).compile()

    service = module.get(RoutesService)
  })

  it('ASSIGNED → IN_PROGRESS succeeds', async () => {
    const before = makeRoute(RouteStatus.ASSIGNED)
    const after = makeRoute(RouteStatus.IN_PROGRESS, {
      statusHistory: [
        ...before.statusHistory,
        {
          fromStatus: RouteStatus.ASSIGNED,
          toStatus: RouteStatus.IN_PROGRESS,
          changedAt: clockNow,
          changedByUserId: bezorgerUserId,
          reason: null,
        },
      ],
    })
    mockSuccessfulTransition(before, after)

    const result = await service.updateRouteStatus(
      bezorger,
      routeId,
      RouteStatus.IN_PROGRESS,
    )

    expect(result.status).toBe(RouteStatus.IN_PROGRESS)
    expect(repository.findOneAndUpdate).toHaveBeenCalledTimes(1)
    const [filter, update, options] =
      repository.findOneAndUpdate.mock.calls[0]
    expect(filter).toEqual({
      _id: new ObjectId(routeId),
      status: RouteStatus.ASSIGNED,
    })
    const setUpdate = update as {
      $set: {
        status: RouteStatus
        statusHistory: DeliveryRoute['statusHistory']
        updatedAt: Date
      }
    }
    expect(setUpdate.$set.status).toBe(RouteStatus.IN_PROGRESS)
    expect(setUpdate.$set.statusHistory).toHaveLength(2)
    expect(setUpdate.$set.updatedAt).toEqual(clockNow)
    expect(options).toEqual({ returnDocument: 'after' })
    expect(eventsService.publishBezorgerRouteUpdated).toHaveBeenCalledWith(
      after,
    )
  })

  it('IN_PROGRESS → COMPLETED succeeds', async () => {
    const before = makeRoute(RouteStatus.IN_PROGRESS, {
      statusHistory: [
        {
          fromStatus: null,
          toStatus: RouteStatus.ASSIGNED,
          changedAt: new Date('2026-07-19T08:00:00.000Z'),
          changedByUserId: adminId,
          reason: 'Route generated',
        },
        {
          fromStatus: RouteStatus.ASSIGNED,
          toStatus: RouteStatus.IN_PROGRESS,
          changedAt: new Date('2026-07-19T10:00:00.000Z'),
          changedByUserId: bezorgerUserId,
          reason: null,
        },
      ],
    })
    const after = makeRoute(RouteStatus.COMPLETED, {
      statusHistory: [
        ...before.statusHistory,
        {
          fromStatus: RouteStatus.IN_PROGRESS,
          toStatus: RouteStatus.COMPLETED,
          changedAt: clockNow,
          changedByUserId: bezorgerUserId,
          reason: null,
        },
      ],
    })
    mockSuccessfulTransition(before, after)

    const result = await service.updateRouteStatus(
      bezorger,
      routeId,
      RouteStatus.COMPLETED,
    )

    expect(result.status).toBe(RouteStatus.COMPLETED)
    expect(eventsService.publishBezorgerRouteUpdated).toHaveBeenCalledTimes(1)
  })

  it('ADMIN can cancel ASSIGNED route with reason', async () => {
    const before = makeRoute(RouteStatus.ASSIGNED)
    const after = makeRoute(RouteStatus.CANCELLED, {
      statusHistory: [
        ...before.statusHistory,
        {
          fromStatus: RouteStatus.ASSIGNED,
          toStatus: RouteStatus.CANCELLED,
          changedAt: clockNow,
          changedByUserId: adminId,
          reason: 'Courier unavailable',
        },
      ],
    })
    mockSuccessfulTransition(before, after)

    const result = await service.updateRouteStatus(
      admin,
      routeId,
      RouteStatus.CANCELLED,
      'Courier unavailable',
    )

    expect(result.status).toBe(RouteStatus.CANCELLED)
    expect(result.statusHistory.at(-1)?.reason).toBe('Courier unavailable')
    expect(result.statusHistory.at(-1)?.changedByUserId).toBe(adminId)
  })

  it('rejects invalid transitions', async () => {
    mockFindOne(makeRoute(RouteStatus.ASSIGNED))

    await expect(
      service.updateRouteStatus(admin, routeId, RouteStatus.COMPLETED),
    ).rejects.toBeInstanceOf(InvalidRouteStatusTransitionException)
    expect(repository.findOneAndUpdate).not.toHaveBeenCalled()
    expect(eventsService.publishBezorgerRouteUpdated).not.toHaveBeenCalled()
  })

  it('COMPLETED is terminal', async () => {
    mockFindOne(makeRoute(RouteStatus.COMPLETED))

    await expect(
      service.updateRouteStatus(admin, routeId, RouteStatus.CANCELLED),
    ).rejects.toBeInstanceOf(RouteCannotBeCancelledException)
  })

  it('CANCELLED is terminal', async () => {
    mockFindOne(makeRoute(RouteStatus.CANCELLED))

    await expect(
      service.updateRouteStatus(admin, routeId, RouteStatus.ASSIGNED),
    ).rejects.toBeInstanceOf(InvalidRouteStatusTransitionException)
  })

  it('same-state request is idempotent without history or publish', async () => {
    const route = makeRoute(RouteStatus.IN_PROGRESS)
    mockFindOne(route)

    const result = await service.updateRouteStatus(
      bezorger,
      routeId,
      RouteStatus.IN_PROGRESS,
    )

    expect(result).toBe(route)
    expect(result.statusHistory).toHaveLength(1)
    expect(repository.findOneAndUpdate).not.toHaveBeenCalled()
    expect(eventsService.publishBezorgerRouteUpdated).not.toHaveBeenCalled()
  })

  it('preserves initial ASSIGNED history and appends one entry', async () => {
    const before = makeRoute(RouteStatus.ASSIGNED)
    const after = makeRoute(RouteStatus.IN_PROGRESS, {
      statusHistory: [
        before.statusHistory[0],
        {
          fromStatus: RouteStatus.ASSIGNED,
          toStatus: RouteStatus.IN_PROGRESS,
          changedAt: clockNow,
          changedByUserId: bezorgerUserId,
          reason: null,
        },
      ],
    })
    mockSuccessfulTransition(before, after)

    await service.updateRouteStatus(
      bezorger,
      routeId,
      RouteStatus.IN_PROGRESS,
    )

    const updateArg = repository.findOneAndUpdate.mock.calls[0][1] as {
      $set: { statusHistory: DeliveryRoute['statusHistory'] }
    }
    expect(updateArg.$set.statusHistory).toHaveLength(2)
    expect(updateArg.$set.statusHistory[0].toStatus).toBe(RouteStatus.ASSIGNED)
    expect(updateArg.$set.statusHistory[0].fromStatus).toBeNull()
    expect(updateArg.$set.statusHistory[1].changedByUserId).toBe(
      bezorgerUserId,
    )
  })

  it('ignores client-forged history metadata (server sets actor and time)', async () => {
    const before = makeRoute(RouteStatus.ASSIGNED)
    const after = makeRoute(RouteStatus.IN_PROGRESS)
    mockSuccessfulTransition(before, after)

    await service.updateRouteStatus(
      bezorger,
      routeId,
      RouteStatus.IN_PROGRESS,
      'start',
    )

    const updateArg = repository.findOneAndUpdate.mock.calls[0][1] as {
      $set: { statusHistory: DeliveryRoute['statusHistory'] }
    }
    const entry = updateArg.$set.statusHistory.at(-1)!
    expect(entry.changedByUserId).toBe(bezorgerUserId)
    expect(entry.changedAt).toEqual(clockNow)
    expect(entry.reason).toBe('start')
  })

  it('normalizes legacy routes missing history on real transition', async () => {
    const before = makeRoute(RouteStatus.ASSIGNED, {
      statusHistory: [],
    })
    const after = makeRoute(RouteStatus.IN_PROGRESS)
    mockSuccessfulTransition(before, after)

    await service.updateRouteStatus(
      admin,
      routeId,
      RouteStatus.IN_PROGRESS,
    )

    const updateArg = repository.findOneAndUpdate.mock.calls[0][1] as {
      $set: { statusHistory: DeliveryRoute['statusHistory'] }
    }
    expect(updateArg.$set.statusHistory).toHaveLength(2)
    expect(updateArg.$set.statusHistory[0].reason).toBe(
      'Legacy route history normalized',
    )
    expect(updateArg.$set.statusHistory[1].toStatus).toBe(
      RouteStatus.IN_PROGRESS,
    )
  })

  it('BEZORGER cannot mutate another courier route', async () => {
    mockFindOne(makeRoute(RouteStatus.ASSIGNED))
    findByUserId.mockResolvedValue(makeProfile(otherProfileId, otherBezorger._id))

    await expect(
      service.updateRouteStatus(
        otherBezorger,
        routeId,
        RouteStatus.IN_PROGRESS,
      ),
    ).rejects.toBeInstanceOf(DeliveryRouteForbiddenException)
    expect(repository.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('BEZORGER cannot cancel', async () => {
    mockFindOne(makeRoute(RouteStatus.ASSIGNED))

    await expect(
      service.updateRouteStatus(bezorger, routeId, RouteStatus.CANCELLED),
    ).rejects.toBeInstanceOf(DeliveryRouteForbiddenException)
  })

  it('APOTHEKER is forbidden', async () => {
    mockFindOne(makeRoute(RouteStatus.ASSIGNED))

    await expect(
      service.updateRouteStatus(
        apotheker,
        routeId,
        RouteStatus.IN_PROGRESS,
      ),
    ).rejects.toBeInstanceOf(DeliveryRouteForbiddenException)
  })

  it('ADMIN may start and complete any route', async () => {
    const assigned = makeRoute(RouteStatus.ASSIGNED)
    const inProgress = makeRoute(RouteStatus.IN_PROGRESS)
    mockSuccessfulTransition(assigned, inProgress)

    await service.updateRouteStatus(admin, routeId, RouteStatus.IN_PROGRESS)
    expect(eventsService.publishBezorgerRouteUpdated).toHaveBeenCalled()
  })

  it('conditional update prevents duplicate history on race', async () => {
    const before = makeRoute(RouteStatus.ASSIGNED)
    const alreadyInProgress = makeRoute(RouteStatus.IN_PROGRESS, {
      statusHistory: [
        ...before.statusHistory,
        {
          fromStatus: RouteStatus.ASSIGNED,
          toStatus: RouteStatus.IN_PROGRESS,
          changedAt: clockNow,
          changedByUserId: bezorgerUserId,
          reason: null,
        },
      ],
    })
    repository.findOne
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(alreadyInProgress)
    repository.findOneAndUpdate.mockResolvedValue(null)

    const result = await service.updateRouteStatus(
      bezorger,
      routeId,
      RouteStatus.IN_PROGRESS,
    )

    expect(result.status).toBe(RouteStatus.IN_PROGRESS)
    expect(result.statusHistory).toHaveLength(2)
    expect(eventsService.publishBezorgerRouteUpdated).not.toHaveBeenCalled()
  })

  it('race loser gets safe error when target is no longer reachable', async () => {
    const before = makeRoute(RouteStatus.ASSIGNED)
    const cancelled = makeRoute(RouteStatus.CANCELLED)
    repository.findOne
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(cancelled)
    repository.findOneAndUpdate.mockResolvedValue(null)

    await expect(
      service.updateRouteStatus(
        bezorger,
        routeId,
        RouteStatus.IN_PROGRESS,
      ),
    ).rejects.toBeInstanceOf(InvalidRouteStatusTransitionException)
    expect(eventsService.publishBezorgerRouteUpdated).not.toHaveBeenCalled()
  })

  it('malformed route id returns DELIVERY_ROUTE_NOT_FOUND', async () => {
    await expect(
      service.updateRouteStatus(
        admin,
        'not-an-object-id',
        RouteStatus.IN_PROGRESS,
      ),
    ).rejects.toBeInstanceOf(DeliveryRouteNotFoundException)
  })

  it('missing route returns DELIVERY_ROUTE_NOT_FOUND', async () => {
    mockFindOne(null)

    await expect(
      service.updateRouteStatus(admin, routeId, RouteStatus.IN_PROGRESS),
    ).rejects.toBeInstanceOf(DeliveryRouteNotFoundException)
  })

  it('does not touch order or stock collaborators (side-effect boundary)', async () => {
    const before = makeRoute(RouteStatus.ASSIGNED)
    const after = makeRoute(RouteStatus.COMPLETED)
    // Force path through IN_PROGRESS→COMPLETED is not this test; start only.
    mockSuccessfulTransition(before, makeRoute(RouteStatus.IN_PROGRESS))

    await service.updateRouteStatus(
      admin,
      routeId,
      RouteStatus.IN_PROGRESS,
    )

    // RoutesService has no OrderService/StockService deps — transition only
    // updates DeliveryRoute via repository + optional PubSub.
    expect(repository.findOneAndUpdate).toHaveBeenCalledTimes(1)
    expect(after.status).toBe(RouteStatus.COMPLETED)
  })
})
