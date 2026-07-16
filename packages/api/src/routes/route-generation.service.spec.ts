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
import { DeliveryRoute } from './delivery-route.entity'
import { DeliveryRouteEventsService } from './delivery-route-events.service'
import {
  DeliveryRouteNotRegenerableException,
  InvalidDeliveryDateException,
  RouteTemplateInactiveException,
} from './exceptions/delivery-route.exceptions'
import { RouteGenerationService } from './route-generation.service'
import { RouteStatus } from './route-status.enum'

describe('RouteGenerationService', () => {
  let service: RouteGenerationService
  let routeRepository: jest.Mocked<
    Pick<MongoRepository<DeliveryRoute>, 'findOne' | 'save' | 'create'>
  >
  let routeTemplatesService: jest.Mocked<
    Pick<RouteTemplatesService, 'findRouteTemplateById'>
  >
  let apothekerProfileService: jest.Mocked<
    Pick<ApothekerProfileService, 'findApothekerProfileById'>
  >
  let bezorgerProfileService: jest.Mocked<
    Pick<BezorgerProfileService, 'findBezorgerProfileById'>
  >
  let orderService: jest.Mocked<
    Pick<
      OrderService,
      | 'findQualifyingOrdersForPharmacist'
      | 'planOrdersForGeneratedRoute'
      | 'publishPlannedOrderUpdates'
    >
  >
  let deliveryRouteEventsService: jest.Mocked<
    Pick<DeliveryRouteEventsService, 'publishBezorgerRouteUpdated'>
  >

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
    routeRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((route: DeliveryRoute) => {
        const id = route._id ?? '807f1f77bcf86cd799439099'
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
      ],
    }).compile()

    service = module.get(RouteGenerationService)
  })

  it('creates a route from an active template with snapshotted stop data', async () => {
    const route = await service.generateDeliveryRoute(
      admin,
      templateId,
      deliveryDate,
    )

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
    expect(route.stops[0].address.street).toBe('Apotheek A Street')
    expect(route.stops[0].lines[0]).toMatchObject({
      vaccineName: 'Influenza',
      quantity: 10,
    })
    expect(route.skippedApothekerProfileIds).toEqual([pharmacyBId])
    expect(route.statusHistory[0].toStatus).toBe(RouteStatus.ASSIGNED)
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
    const route = await service.generateDeliveryRoute(
      admin,
      templateId,
      deliveryDate,
    )

    expect(route.stops.map(stop => stop.sequence)).toEqual([1])
    expect(route.skippedApothekerProfileIds).toContain(pharmacyBId)
  })

  it('preserves relative template order when both pharmacies qualify', async () => {
    orderService.findQualifyingOrdersForPharmacist.mockImplementation(
      (userId: string) => {
        if (userId === pharmacyAUserId) {
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

    const route = await service.generateDeliveryRoute(
      admin,
      templateId,
      deliveryDate,
    )

    expect(route.stops.map(stop => stop.apothekerProfileId)).toEqual([
      pharmacyAId,
      pharmacyBId,
    ])
    expect(route.stops.map(stop => stop.sequence)).toEqual([1, 2])
  })

  it('persists an empty route when no stops qualify', async () => {
    orderService.findQualifyingOrdersForPharmacist.mockResolvedValue([])
    orderService.planOrdersForGeneratedRoute.mockResolvedValue([])

    const route = await service.generateDeliveryRoute(
      admin,
      templateId,
      deliveryDate,
    )

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

    const route = await service.generateDeliveryRoute(
      admin,
      templateId,
      deliveryDate,
    )

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

    const route = await service.generateDeliveryRoute(
      admin,
      templateId,
      deliveryDate,
    )

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

    expect(orderService.publishPlannedOrderUpdates).not.toHaveBeenCalled()
    expect(
      deliveryRouteEventsService.publishBezorgerRouteUpdated,
    ).not.toHaveBeenCalled()
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
})
