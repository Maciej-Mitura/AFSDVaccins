import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { Order } from '../order/order.entity'
import { OrderService } from '../order/order.service'
import { OrderStatus } from '../order/order-status.enum'
import { ApothekerProfile } from '../profile/apotheker/apotheker-profile.entity'
import { ApothekerProfileService } from '../profile/apotheker/apotheker-profile.service'
import { BezorgerProfileService } from '../profile/bezorger/bezorger-profile.service'
import { RouteTemplateNotFoundException } from '../route-templates/exceptions/route-template.exceptions'
import { RouteTemplate } from '../route-templates/route-template.entity'
import { RouteTemplatesService } from '../route-templates/route-templates.service'
import { SettingsService } from '../settings/settings.service'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { BusinessNotificationProducerService } from '../notifications/business-notification-producer.service'
import { DeliveryRoute } from './delivery-route.entity'
import { DeliveryRouteEventsService } from './delivery-route-events.service'
import {
  DeliveryRouteNotRegenerableException,
  InvalidDeliveryDateException,
  RouteTemplateInactiveException,
} from './exceptions/delivery-route.exceptions'
import {
  DELIVERY_QR_RANDOM_SOURCE,
  DELIVERY_QR_TEST_SIGNING_SECRET,
  DELIVERY_QR_TOKEN_SERVICE,
} from './qr/delivery-qr.constants'
import type { DeliveryQrRandomSource } from './qr/delivery-qr-nonce.util'
import { HmacDeliveryQrTokenService } from './qr/hmac-delivery-qr-token.service'
import { verifyPersistedStopQrToken } from './qr/verify-persisted-stop-qr-token'
import { RouteGenerationService } from './route-generation.service'
import { RouteStatus } from './route-status.enum'

describe('RouteGenerationService', () => {
  let service: RouteGenerationService
  let routeRepository: jest.Mocked<
    Pick<MongoRepository<DeliveryRoute>, 'findOne' | 'save' | 'create' | 'find'>
  >
  let routeTemplatesService: jest.Mocked<
    Pick<
      RouteTemplatesService,
      'findRouteTemplateById' | 'findRouteTemplates'
    >
  >
  let apothekerProfileService: jest.Mocked<
    Pick<
      ApothekerProfileService,
      'findApothekerProfileById' | 'listApothekerProfiles'
    >
  >
  let bezorgerProfileService: jest.Mocked<
    Pick<BezorgerProfileService, 'findBezorgerProfileById'>
  >
  let orderService: jest.Mocked<
    Pick<
      OrderService,
      | 'findQualifyingOrdersForPharmacist'
      | 'findQualifyingOrdersForRoute'
      | 'findOrdersForPharmacyAndDeliveryDate'
      | 'findOrders'
      | 'planOrdersForGeneratedRoute'
      | 'publishPlannedOrderUpdates'
    >
  >
  let deliveryRouteEventsService: jest.Mocked<
    Pick<DeliveryRouteEventsService, 'publishBezorgerRouteUpdated'>
  >
  let deliveryQrRandomSource: DeliveryQrRandomSource
  let randomCounter = 0
  const deliveryQrTokenService = new HmacDeliveryQrTokenService(
    DELIVERY_QR_TEST_SIGNING_SECRET,
  )

  const admin: User = {
    _id: '507f1f77bcf86cd799439012',
    id: '507f1f77bcf86cd799439012',
    firebaseUid: 'firebase-admin',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: UserRole.ADMIN,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const templateId = '607f1f77bcf86cd799439001'
  const bezorgerProfileId = '607f1f77bcf86cd799439002'
  const pharmacyAId = '607f1f77bcf86cd799439011'
  const pharmacyBId = '607f1f77bcf86cd799439012'
  const pharmacyAUserId = '507f1f77bcf86cd799439021'
  const pharmacyBUserId = '507f1f77bcf86cd799439022'
  const orderAId = '707f1f77bcf86cd799439031'
  const deliveryDate = '2026-07-16'

  function makeProfile(
    id: string,
    userId: string,
    name: string,
  ): ApothekerProfile {
    return {
      _id: id,
      id,
      userId,
      pharmacyName: name,
      address: {
        street: `${name} Street`,
        houseNumber: '1',
        postalCode: '9000',
        city: 'Gent',
        country: 'BE',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  function makeOrder(
    id: string,
    apothekerId: string,
    status: OrderStatus,
  ): Order {
    return {
      _id: id,
      id,
      apothekerId,
      status,
      orderLines: [
        {
          vaccineId: '507f1f77bcf86cd799439041',
          vaccineName: 'Influenza',
          manufacturer: 'PharmaCo',
          quantity: 10,
        },
      ],
      totalQuantity: 10,
      isoWeek: 29,
      isoYear: 2026,
      submittedAt: new Date(),
      deliveryDate,
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  function makeTemplate(active = true): RouteTemplate {
    return {
      _id: templateId,
      id: templateId,
      name: 'Ochtendroute',
      normalizedName: 'ochtendroute',
      active,
      bezorgerProfileId,
      stops: [
        { apothekerProfileId: pharmacyAId, sequence: 1 },
        { apothekerProfileId: pharmacyBId, sequence: 2 },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdByUserId: admin.id,
      updatedByUserId: admin.id,
    }
  }

  beforeEach(async () => {
    randomCounter = 0
    deliveryQrRandomSource = {
      randomBytes: size => {
        const buffer = Buffer.alloc(size, 0)
        buffer.writeUInt32BE(randomCounter, 0)
        randomCounter += 1
        return buffer
      },
      randomStopId: () => {
        const id = `generated-stop-${randomCounter}`
        randomCounter += 1
        return id
      },
    }

    routeRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((route: DeliveryRoute) => {
        const rawId = route._id ?? '807f1f77bcf86cd799439099'
        const id =
          typeof rawId === 'object' &&
          rawId !== null &&
          'toHexString' in rawId &&
          typeof (rawId as { toHexString: () => string }).toHexString ===
            'function'
            ? (rawId as { toHexString: () => string }).toHexString()
            : String(rawId)

        return Promise.resolve({
          ...route,
          _id: id,
          id,
        })
      }),
      create: jest.fn().mockImplementation((data: Partial<DeliveryRoute>) => ({
        ...data,
      })),
    }

    routeTemplatesService = {
      findRouteTemplateById: jest.fn().mockResolvedValue(makeTemplate()),
      findRouteTemplates: jest.fn().mockResolvedValue([makeTemplate()]),
    }

    apothekerProfileService = {
      findApothekerProfileById: jest.fn().mockImplementation((id: string) => {
        if (id === pharmacyAId) {
          return Promise.resolve(
            makeProfile(pharmacyAId, pharmacyAUserId, 'Apotheek A'),
          )
        }

        if (id === pharmacyBId) {
          return Promise.resolve(
            makeProfile(pharmacyBId, pharmacyBUserId, 'Apotheek B'),
          )
        }

        throw new Error('profile not found')
      }),
      listApothekerProfiles: jest.fn().mockResolvedValue([
        makeProfile(pharmacyAId, pharmacyAUserId, 'Apotheek A'),
        makeProfile(pharmacyBId, pharmacyBUserId, 'Apotheek B'),
      ]),
    }

    bezorgerProfileService = {
      findBezorgerProfileById: jest.fn().mockResolvedValue({
        id: bezorgerProfileId,
        userId: '507f1f77bcf86cd799439050',
      }),
    }

    orderService = {
      findQualifyingOrdersForPharmacist: jest
        .fn()
        .mockImplementation((userId: string) => {
          if (userId === pharmacyAUserId) {
            return Promise.resolve([
              makeOrder(orderAId, pharmacyAUserId, OrderStatus.PENDING),
            ])
          }

          return Promise.resolve([])
        }),
      findQualifyingOrdersForRoute: jest
        .fn()
        .mockImplementation(
          (params: { apothekerUserId: string; deliveryDate: string }) => {
            if (params.apothekerUserId === pharmacyAUserId) {
              return Promise.resolve([
                makeOrder(orderAId, pharmacyAUserId, OrderStatus.PENDING),
              ])
            }

            return Promise.resolve([])
          },
        ),
      findOrdersForPharmacyAndDeliveryDate: jest
        .fn()
        .mockImplementation(
          (params: { apothekerUserId: string; deliveryDate: string }) => {
            if (params.apothekerUserId === pharmacyAUserId) {
              return Promise.resolve([
                makeOrder(orderAId, pharmacyAUserId, OrderStatus.PENDING),
              ])
            }

            return Promise.resolve([])
          },
        ),
      findOrders: jest.fn().mockResolvedValue([]),
      planOrdersForGeneratedRoute: jest
        .fn()
        .mockResolvedValue([
          makeOrder(orderAId, pharmacyAUserId, OrderStatus.PLANNED),
        ]),
      publishPlannedOrderUpdates: jest.fn().mockResolvedValue(undefined),
    }

    deliveryRouteEventsService = {
      publishBezorgerRouteUpdated: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteGenerationService,
        {
          provide: getRepositoryToken(DeliveryRoute),
          useValue: routeRepository,
        },
        {
          provide: RouteTemplatesService,
          useValue: routeTemplatesService,
        },
        {
          provide: ApothekerProfileService,
          useValue: apothekerProfileService,
        },
        {
          provide: BezorgerProfileService,
          useValue: bezorgerProfileService,
        },
        { provide: OrderService, useValue: orderService },
        {
          provide: SettingsService,
          useValue: {
            getApplicationSettings: () =>
              Promise.resolve({ timezone: 'Europe/Brussels' }),
          },
        },
        {
          provide: DeliveryRouteEventsService,
          useValue: deliveryRouteEventsService,
        },
        {
          provide: BusinessNotificationProducerService,
          useValue: {
            notifyCourierRouteAssigned: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DELIVERY_QR_RANDOM_SOURCE,
          useValue: deliveryQrRandomSource,
        },
        {
          provide: DELIVERY_QR_TOKEN_SERVICE,
          useValue: deliveryQrTokenService,
        },
      ],
    }).compile()

    service = module.get(RouteGenerationService)
  })

  it('creates a route from an active template with snapshotted stop data', async () => {
    const { route } = await service.generateDeliveryRoute(admin, templateId, deliveryDate)

    expect(route.bezorgerProfileId).toBe(bezorgerProfileId)
    expect(route.routeTemplateId).toBe(templateId)
    expect(route.deliveryDate).toBe(deliveryDate)
    expect(route.status).toBe(RouteStatus.ASSIGNED)
    expect(route.stops).toHaveLength(1)
    expect(route.stops[0]).toMatchObject({
      sequence: 1,
      apothekerProfileId: pharmacyAId,
      apothekerUserId: pharmacyAUserId,
      pharmacyName: 'Apotheek A',
      orderIds: [orderAId],
      orderCount: 1,
      totalQuantity: 10,
    })
    expect(route.stops[0].stopId).toEqual(expect.any(String))
    expect(route.stops[0].qrConfirmation).toMatchObject({
      tokenVersion: 1,
      consumedAt: null,
      consumedByUserId: null,
    })
    expect(route.stops[0].qrConfirmation?.nonceHash).toMatch(/^[a-f0-9]{64}$/i)
    expect(route.stops[0].qrConfirmation?.encodedToken).toContain('.')
    expect(route.stops[0]).not.toHaveProperty('nonce')
    expect(JSON.stringify(route.stops[0])).not.toMatch(/"nonce":/)
    verifyPersistedStopQrToken(
      deliveryQrTokenService,
      route.stops[0].qrConfirmation!,
      { routeId: route.id, stopId: route.stops[0].stopId },
    )
    expect(route.stops[0].deliveryProof).toBeNull()
    expect(route.stops[0].address.street).toBe('Apotheek A Street')
    expect(route.stops[0].lines[0]).toMatchObject({
      vaccineName: 'Influenza',
      quantity: 10,
    })
    expect(route.skippedApothekerProfileIds).toEqual([pharmacyBId])
    expect(route.statusHistory[0].toStatus).toBe(RouteStatus.ASSIGNED)
    // Single complete insert — no incomplete shell write.
    expect(routeRepository.save).toHaveBeenCalledTimes(1)
    const persisted = routeRepository.save.mock.calls[0][0] as DeliveryRoute
    expect(persisted.stops).toHaveLength(1)
    expect(persisted.stops[0].qrConfirmation?.encodedToken).toContain('.')
    expect(persisted.stops[0].qrConfirmation?.nonceHash).toMatch(
      /^[a-f0-9]{64}$/i,
    )
    expect(orderService.planOrdersForGeneratedRoute).toHaveBeenCalledWith(
      admin,
      [orderAId],
    )
    expect(orderService.publishPlannedOrderUpdates).toHaveBeenCalled()
    expect(
      deliveryRouteEventsService.publishBezorgerRouteUpdated,
    ).toHaveBeenCalled()
  })

  it('skips pharmacies without qualifying orders and renormalizes sequence', async () => {
    const { route } = await service.generateDeliveryRoute(admin, templateId, deliveryDate)

    expect(route.stops.map(stop => stop.sequence)).toEqual([1])
    expect(route.skippedApothekerProfileIds).toContain(pharmacyBId)
  })

  it('preserves relative template order when both pharmacies qualify', async () => {
    orderService.findOrdersForPharmacyAndDeliveryDate.mockImplementation(
      (params: { apothekerUserId: string; deliveryDate: string }) => {
        if (params.apothekerUserId === pharmacyAUserId) {
          return Promise.resolve([
            makeOrder(orderAId, pharmacyAUserId, OrderStatus.PENDING),
          ])
        }

        return Promise.resolve([
          makeOrder(
            '707f1f77bcf86cd799439032',
            pharmacyBUserId,
            OrderStatus.PENDING,
          ),
        ])
      },
    )

    const { route } = await service.generateDeliveryRoute(admin, templateId, deliveryDate)

    expect(route.stops.map(stop => stop.apothekerProfileId)).toEqual([
      pharmacyAId,
      pharmacyBId,
    ])
    expect(route.stops.map(stop => stop.sequence)).toEqual([1, 2])
  })

  it('persists an empty route when no stops qualify', async () => {
    orderService.findOrdersForPharmacyAndDeliveryDate.mockResolvedValue([])
    orderService.findQualifyingOrdersForRoute.mockResolvedValue([])
    orderService.planOrdersForGeneratedRoute.mockResolvedValue([])

    const { route } = await service.generateDeliveryRoute(admin, templateId, deliveryDate)

    expect(route.stops).toEqual([])
    expect(route.skippedApothekerProfileIds).toEqual([
      pharmacyAId,
      pharmacyBId,
    ])
    expect(
      deliveryRouteEventsService.publishBezorgerRouteUpdated,
    ).toHaveBeenCalled()
  })

  it('rejects inactive templates', async () => {
    routeTemplatesService.findRouteTemplateById.mockResolvedValue(
      makeTemplate(false),
    )

    await expect(
      service.generateDeliveryRoute(admin, templateId, deliveryDate),
    ).rejects.toBeInstanceOf(RouteTemplateInactiveException)
    expect(orderService.planOrdersForGeneratedRoute).not.toHaveBeenCalled()
    expect(
      deliveryRouteEventsService.publishBezorgerRouteUpdated,
    ).not.toHaveBeenCalled()
  })

  it('rejects missing templates', async () => {
    routeTemplatesService.findRouteTemplateById.mockRejectedValue(
      new RouteTemplateNotFoundException(),
    )

    await expect(
      service.generateDeliveryRoute(admin, templateId, deliveryDate),
    ).rejects.toBeInstanceOf(RouteTemplateNotFoundException)
  })

  it('rejects malformed template ids', async () => {
    await expect(
      service.generateDeliveryRoute(admin, 'not-an-id', deliveryDate),
    ).rejects.toBeInstanceOf(RouteTemplateNotFoundException)
  })

  it('rejects invalid delivery dates', async () => {
    await expect(
      service.generateDeliveryRoute(admin, templateId, '16-07-2026'),
    ).rejects.toBeInstanceOf(InvalidDeliveryDateException)
  })

  it('upserts the same route on regeneration and refreshes snapshots', async () => {
    const existingId = '807f1f77bcf86cd799439088'
    const existing: DeliveryRoute = {
      _id: existingId,
      id: existingId,
      routeTemplateId: templateId,
      bezorgerProfileId,
      deliveryDate,
      status: RouteStatus.ASSIGNED,
      stops: [],
      skippedApothekerProfileIds: [pharmacyAId, pharmacyBId],
      statusHistory: [],
      generatedAt: new Date('2026-07-15T10:00:00.000Z'),
      generatedByUserId: admin.id,
      createdAt: new Date('2026-07-15T10:00:00.000Z'),
      updatedAt: new Date('2026-07-15T10:00:00.000Z'),
    }

    routeRepository.findOne.mockResolvedValue(existing)

    const { route } = await service.generateDeliveryRoute(admin, templateId, deliveryDate)

    expect(route.id).toBe(existingId)
    expect(route.stops).toHaveLength(1)
    expect(route.stops[0].pharmacyName).toBe('Apotheek A')
    expect(routeRepository.save).toHaveBeenCalledTimes(1)
  })

  it('rejects regeneration of IN_PROGRESS routes', async () => {
    routeRepository.findOne.mockResolvedValue({
      _id: '807f1f77bcf86cd799439088',
      id: '807f1f77bcf86cd799439088',
      status: RouteStatus.IN_PROGRESS,
      bezorgerProfileId,
      deliveryDate,
      stops: [],
      skippedApothekerProfileIds: [],
      statusHistory: [],
      routeTemplateId: templateId,
      generatedAt: new Date(),
      generatedByUserId: admin.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await expect(
      service.generateDeliveryRoute(admin, templateId, deliveryDate),
    ).rejects.toBeInstanceOf(DeliveryRouteNotRegenerableException)
    expect(orderService.planOrdersForGeneratedRoute).not.toHaveBeenCalled()
    expect(
      deliveryRouteEventsService.publishBezorgerRouteUpdated,
    ).not.toHaveBeenCalled()
  })

  it('allows regeneration of CANCELLED routes per architecture', async () => {
    const existingId = '807f1f77bcf86cd799439077'
    routeRepository.findOne.mockResolvedValue({
      _id: existingId,
      id: existingId,
      status: RouteStatus.CANCELLED,
      bezorgerProfileId,
      deliveryDate,
      stops: [],
      skippedApothekerProfileIds: [],
      statusHistory: [],
      routeTemplateId: templateId,
      generatedAt: new Date(),
      generatedByUserId: admin.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const { route } = await service.generateDeliveryRoute(admin, templateId, deliveryDate)

    expect(route.status).toBe(RouteStatus.ASSIGNED)
    expect(route.id).toBe(existingId)
  })

  it('publishes nothing when route persistence fails after planning', async () => {
    orderService.planOrdersForGeneratedRoute.mockResolvedValue([
      makeOrder(orderAId, pharmacyAUserId, OrderStatus.PLANNED),
    ])
    routeRepository.save.mockRejectedValue(new Error('db write failed'))

    await expect(
      service.generateDeliveryRoute(admin, templateId, deliveryDate),
    ).rejects.toThrow('db write failed')

    expect(routeRepository.save).toHaveBeenCalledTimes(1)
    expect(orderService.publishPlannedOrderUpdates).not.toHaveBeenCalled()
    expect(
      deliveryRouteEventsService.publishBezorgerRouteUpdated,
    ).not.toHaveBeenCalled()
  })

  it('leaves no incomplete route when QR token minting fails before save', async () => {
    const failingTokenService = {
      sign: () => {
        throw new Error('signing failed')
      },
      verify: jest.fn(),
    }

    const moduleWithFailingSigner: TestingModule = await Test.createTestingModule(
      {
        providers: [
          RouteGenerationService,
          {
            provide: getRepositoryToken(DeliveryRoute),
            useValue: routeRepository,
          },
          {
            provide: RouteTemplatesService,
            useValue: routeTemplatesService,
          },
          {
            provide: ApothekerProfileService,
            useValue: apothekerProfileService,
          },
          {
            provide: BezorgerProfileService,
            useValue: bezorgerProfileService,
          },
          { provide: OrderService, useValue: orderService },
          {
            provide: SettingsService,
            useValue: {
              getApplicationSettings: () =>
                Promise.resolve({ timezone: 'Europe/Brussels' }),
            },
          },
          {
            provide: DeliveryRouteEventsService,
            useValue: deliveryRouteEventsService,
          },
          {
            provide: BusinessNotificationProducerService,
            useValue: {
              notifyCourierRouteAssigned: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: DELIVERY_QR_RANDOM_SOURCE,
            useValue: deliveryQrRandomSource,
          },
          {
            provide: DELIVERY_QR_TOKEN_SERVICE,
            useValue: failingTokenService,
          },
        ],
      },
    ).compile()

    const failingService = moduleWithFailingSigner.get(RouteGenerationService)

    await expect(
      failingService.generateDeliveryRoute(admin, templateId, deliveryDate),
    ).rejects.toThrow('signing failed')

    expect(routeRepository.save).not.toHaveBeenCalled()
    expect(orderService.planOrdersForGeneratedRoute).not.toHaveBeenCalled()
    expect(orderService.publishPlannedOrderUpdates).not.toHaveBeenCalled()
  })

  it('persists a newly generated route only after stops and QR metadata are complete', async () => {
    const { route } = await service.generateDeliveryRoute(admin, templateId, deliveryDate)

    expect(routeRepository.save).toHaveBeenCalledTimes(1)
    const persisted = routeRepository.save.mock.calls[0][0] as DeliveryRoute
    expect(persisted.stops.every(stop => stop.qrConfirmation != null)).toBe(
      true,
    )
    expect(
      persisted.stops.every(
        stop =>
          typeof stop.qrConfirmation?.encodedToken === 'string' &&
          typeof stop.qrConfirmation?.nonceHash === 'string',
      ),
    ).toBe(true)
    expect(String(persisted._id).length).toBeGreaterThan(0)
    verifyPersistedStopQrToken(
      deliveryQrTokenService,
      route.stops[0].qrConfirmation!,
      { routeId: String(route.id), stopId: route.stops[0].stopId },
    )
  })

  it('publishes order updates only after successful route persistence', async () => {
    const planned = makeOrder(orderAId, pharmacyAUserId, OrderStatus.PLANNED)
    orderService.planOrdersForGeneratedRoute.mockResolvedValue([planned])

    const publishOrderOrder: string[] = []
    orderService.publishPlannedOrderUpdates.mockImplementation(() => {
      publishOrderOrder.push('orders')
      return Promise.resolve()
    })
    deliveryRouteEventsService.publishBezorgerRouteUpdated.mockImplementation(
      () => {
        publishOrderOrder.push('route')
        return Promise.resolve()
      },
    )

    await service.generateDeliveryRoute(admin, templateId, deliveryDate)

    expect(publishOrderOrder).toEqual(['orders', 'route'])
  })

  it('assigns a unique stopId, nonceHash, and encodedToken to every generated stop', async () => {
    orderService.findOrdersForPharmacyAndDeliveryDate.mockImplementation(
      (params: { apothekerUserId: string; deliveryDate: string }) => {
        if (params.apothekerUserId === pharmacyAUserId) {
          return Promise.resolve([
            makeOrder(orderAId, pharmacyAUserId, OrderStatus.PENDING),
          ])
        }

        return Promise.resolve([
          makeOrder(
            '707f1f77bcf86cd799439032',
            pharmacyBUserId,
            OrderStatus.PENDING,
          ),
        ])
      },
    )

    const { route } = await service.generateDeliveryRoute(admin, templateId, deliveryDate)

    expect(route.stops).toHaveLength(2)
    expect(route.stops[0].stopId).not.toBe(route.stops[1].stopId)
    expect(route.stops[0].qrConfirmation?.nonceHash).not.toBe(
      route.stops[1].qrConfirmation?.nonceHash,
    )
    expect(route.stops[0].qrConfirmation?.encodedToken).not.toBe(
      route.stops[1].qrConfirmation?.encodedToken,
    )
  })

  it('never reuses stop nonces or encoded tokens across separately generated routes', async () => {
    const { route: first } = await service.generateDeliveryRoute(admin, templateId, deliveryDate)

    routeRepository.findOne.mockResolvedValue(null)
    const { route: second } = await service.generateDeliveryRoute(
      admin,
      templateId,
      '2026-07-17',
    )

    expect(first.stops[0].qrConfirmation?.nonceHash).not.toBe(
      second.stops[0].qrConfirmation?.nonceHash,
    )
    expect(first.stops[0].qrConfirmation?.encodedToken).not.toBe(
      second.stops[0].qrConfirmation?.encodedToken,
    )
    expect(first.stops[0].stopId).not.toBe(second.stops[0].stopId)
  })

  it('leaves RouteTemplate stops unchanged (no QR state written back)', async () => {
    const templateBefore = makeTemplate()
    routeTemplatesService.findRouteTemplateById.mockResolvedValue(templateBefore)

    await service.generateDeliveryRoute(admin, templateId, deliveryDate)

    expect(templateBefore.stops).toEqual([
      { apothekerProfileId: pharmacyAId, sequence: 1 },
      { apothekerProfileId: pharmacyBId, sequence: 2 },
    ])
    expect(templateBefore.stops[0]).not.toHaveProperty('qrConfirmation')
    expect(templateBefore.stops[0]).not.toHaveProperty('stopId')
  })
})
