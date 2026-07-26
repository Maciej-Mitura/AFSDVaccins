import { ObjectId } from 'mongodb'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'

import { OrderService } from '../order/order.service'
import { CLOCK } from '../order/clock.provider'
import { ApothekerProfileService } from '../profile/apotheker/apotheker-profile.service'
import { BezorgerProfile } from '../profile/bezorger/bezorger-profile.entity'
import { BezorgerProfileService } from '../profile/bezorger/bezorger-profile.service'
import { RouteTemplatesService } from '../route-templates/route-templates.service'
import { SettingsService } from '../settings/settings.service'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { BusinessNotificationProducerService } from '../notifications/business-notification-producer.service'
import { DeliveryRoute } from './delivery-route.entity'
import { DeliveryRouteEventsService } from './delivery-route-events.service'
import {
  DELIVERY_QR_RANDOM_SOURCE,
  DELIVERY_QR_TEST_SIGNING_SECRET,
  DELIVERY_QR_TOKEN_SERVICE,
} from './qr/delivery-qr.constants'
import { systemDeliveryQrRandomSource } from './qr/delivery-qr-nonce.util'
import { HmacDeliveryQrTokenService } from './qr/hmac-delivery-qr-token.service'
import { RouteGenerationService } from './route-generation.service'
import { RoutePreviewService } from './route-preview.service'
import { RouteStatus } from './route-status.enum'
import { RoutesService } from './routes.service'

describe('RoutesService.findMyTodayRoute', () => {
  let service: RoutesService
  let findByBezorgerAndDate: jest.Mock
  let findByUserId: jest.Mock
  let clockNow: Date

  const userId = '507f1f77bcf86cd799439010'
  const profileIdString = '607f1f77bcf86cd799439002'
  const otherProfileId = '607f1f77bcf86cd799439099'
  const todayBrussels = '2026-07-19'

  const bezorger: User = {
    _id: userId,
    id: userId,
    firebaseUid: 'firebase-bezorger',
    email: 'bezorger@example.com',
    firstName: 'Bezorger',
    lastName: 'User',
    role: UserRole.BEZORGER,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  function makeRoute(
    bezorgerProfileId: string,
    deliveryDate: string,
    stops: DeliveryRoute['stops'] = [],
  ): DeliveryRoute {
    return {
      _id: '707f1f77bcf86cd799439031',
      id: '707f1f77bcf86cd799439031',
      routeTemplateId: '607f1f77bcf86cd799439001',
      bezorgerProfileId,
      deliveryDate,
      status: RouteStatus.ASSIGNED,
      stops,
      skippedApothekerProfileIds: [],
      statusHistory: [],
      generatedAt: new Date(),
      generatedByUserId: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  function makeProfile(id: string | ObjectId): BezorgerProfile {
    return {
      _id: id as unknown as string,
      get id() {
        return this._id
      },
      userId,
      displayName: 'Courier',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  beforeEach(async () => {
    clockNow = new Date('2026-07-19T10:00:00.000Z')

    findByBezorgerAndDate = jest.fn().mockResolvedValue(null)
    findByUserId = jest.fn().mockResolvedValue(makeProfile(profileIdString))

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutesService,
        {
          provide: getRepositoryToken(DeliveryRoute),
          useValue: {},
        },
        {
          provide: RouteGenerationService,
          useValue: {
            findByBezorgerAndDate,
            getLocalTodayDeliveryDate: jest.fn(),
          },
        },
        {
          provide: RoutePreviewService,
          useValue: { computeTomorrowPreview: jest.fn() },
        },
        {
          provide: DeliveryRouteEventsService,
          useValue: { publishBezorgerRouteUpdated: jest.fn() },
        },
        {
          provide: BusinessNotificationProducerService,
          useValue: {
            notifyPharmacyRouteStarted: jest.fn().mockResolvedValue(undefined),
          },
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

  it('uses Europe/Brussels local date for today', async () => {
    const route = makeRoute(profileIdString, todayBrussels, [
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
        lines: [],
      },
    ])
    findByBezorgerAndDate.mockResolvedValue(route)

    const result = await service.findMyTodayRoute(bezorger)

    expect(findByBezorgerAndDate).toHaveBeenCalledWith(
      profileIdString,
      todayBrussels,
    )
    expect(result).toBe(route)
    expect(result?.stops).toHaveLength(1)
  })

  it('uses Brussels date across the UTC day boundary', async () => {
    clockNow = new Date('2026-07-19T22:30:00.000Z')
    findByBezorgerAndDate.mockResolvedValue(
      makeRoute(profileIdString, '2026-07-20'),
    )

    await service.findMyTodayRoute(bezorger)

    expect(findByBezorgerAndDate).toHaveBeenCalledWith(
      profileIdString,
      '2026-07-20',
    )
  })

  it('resolves the authenticated courier profile id as string', async () => {
    findByUserId.mockResolvedValue(makeProfile(new ObjectId(profileIdString)))
    findByBezorgerAndDate.mockResolvedValue(
      makeRoute(profileIdString, todayBrussels),
    )

    await service.findMyTodayRoute(bezorger)

    const [calledProfileId] = findByBezorgerAndDate.mock.calls[0] as [
      string,
      string,
    ]
    expect(calledProfileId).toBe(profileIdString)
    expect(typeof calledProfileId).toBe('string')
  })

  it('returns an empty persisted route instead of null', async () => {
    const empty = makeRoute(profileIdString, todayBrussels, [])
    findByBezorgerAndDate.mockResolvedValue(empty)

    const result = await service.findMyTodayRoute(bezorger)

    expect(result).not.toBeNull()
    expect(result?.stops).toEqual([])
  })

  it('returns null only when no matching route exists', async () => {
    findByBezorgerAndDate.mockResolvedValue(null)

    await expect(service.findMyTodayRoute(bezorger)).resolves.toBeNull()
  })

  it('looks up only the current courier profile id', async () => {
    await service.findMyTodayRoute(bezorger)

    expect(findByBezorgerAndDate).toHaveBeenCalledWith(
      profileIdString,
      todayBrussels,
    )
    expect(findByBezorgerAndDate).not.toHaveBeenCalledWith(
      otherProfileId,
      expect.anything(),
    )
  })
})

describe('RouteGenerationService.findByBezorgerAndDate', () => {
  it('finds a route when profile id is stored as string and queried as ObjectId', async () => {
    const profileId = '607f1f77bcf86cd799439002'
    const deliveryDate = '2026-07-19'
    const stored = {
      _id: '707f1f77bcf86cd799439031',
      id: '707f1f77bcf86cd799439031',
      bezorgerProfileId: profileId,
      deliveryDate,
      stops: [],
      status: RouteStatus.ASSIGNED,
    }

    const findOne = jest
      .fn()
      .mockImplementation(
        (query: { where: { deliveryDate: string; bezorgerProfileId: unknown } }) => {
          const { where } = query
          if (
            where.deliveryDate === deliveryDate &&
            where.bezorgerProfileId === profileId
          ) {
            return Promise.resolve(stored)
          }

          return Promise.resolve(null)
        },
      )

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteGenerationService,
        {
          provide: getRepositoryToken(DeliveryRoute),
          useValue: { findOne, save: jest.fn(), create: jest.fn() },
        },
        { provide: RouteTemplatesService, useValue: {} },
        { provide: ApothekerProfileService, useValue: {} },
        { provide: BezorgerProfileService, useValue: {} },
        { provide: OrderService, useValue: {} },
        {
          provide: SettingsService,
          useValue: {
            getApplicationSettings: () =>
              Promise.resolve({ timezone: 'Europe/Brussels' }),
          },
        },
        { provide: DeliveryRouteEventsService, useValue: {} },
        {
          provide: BusinessNotificationProducerService,
          useValue: {
            notifyCourierRouteAssigned: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DELIVERY_QR_RANDOM_SOURCE,
          useValue: systemDeliveryQrRandomSource,
        },
        {
          provide: DELIVERY_QR_TOKEN_SERVICE,
          useValue: new HmacDeliveryQrTokenService(
            DELIVERY_QR_TEST_SIGNING_SECRET,
          ),
        },
      ],
    }).compile()

    const generation = module.get(RouteGenerationService)
    const result = await generation.findByBezorgerAndDate(
      new ObjectId(profileId) as unknown as string,
      deliveryDate,
    )

    expect(result).toEqual(stored)
    expect(findOne).toHaveBeenCalledWith({
      where: { bezorgerProfileId: profileId, deliveryDate },
    })
  })
})
