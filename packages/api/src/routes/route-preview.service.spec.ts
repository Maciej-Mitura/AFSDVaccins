import { Test, TestingModule } from '@nestjs/testing'

import { CLOCK } from '../order/clock.provider'
import {
  getLocalTomorrowDate,
  resolveDeliveryDate,
} from '../order/delivery-date.util'
import { Order } from '../order/order.entity'
import { OrderService } from '../order/order.service'
import { OrderStatus } from '../order/order-status.enum'
import { ApothekerProfile } from '../profile/apotheker/apotheker-profile.entity'
import { ApothekerProfileService } from '../profile/apotheker/apotheker-profile.service'
import { BezorgerProfile } from '../profile/bezorger/bezorger-profile.entity'
import { BezorgerProfileService } from '../profile/bezorger/bezorger-profile.service'
import { BezorgerProfileNotFoundException } from '../profile/exceptions/profile.exceptions'
import { RouteTemplateNotAssignedException } from '../route-templates/exceptions/route-template.exceptions'
import { RouteTemplate } from '../route-templates/route-template.entity'
import { RouteTemplatesService } from '../route-templates/route-templates.service'
import { SettingsService } from '../settings/settings.service'
import { User } from '../user/user.entity'
import { UserRole } from '../user/user-role.enum'
import { DeliveryRouteForbiddenException } from './exceptions/delivery-route.exceptions'
import { RoutePreviewService } from './route-preview.service'

describe('RoutePreviewService', () => {
  let service: RoutePreviewService
  let routeTemplatesService: jest.Mocked<
    Pick<RouteTemplatesService, 'findActiveTemplatesForBezorgerProfile'>
  >
  let apothekerProfileService: jest.Mocked<
    Pick<ApothekerProfileService, 'findApothekerProfileById'>
  >
  let bezorgerProfileService: jest.Mocked<
    Pick<BezorgerProfileService, 'findByUserId'>
  >
  let orderService: jest.Mocked<
    Pick<
      OrderService,
      | 'findQualifyingOrdersForRoute'
      | 'planOrdersForGeneratedRoute'
      | 'publishPlannedOrderUpdates'
    >
  >
  let settingsService: jest.Mocked<Pick<SettingsService, 'getApplicationSettings'>>
  let clockNow: Date

  const bezorgerUserId = '507f1f77bcf86cd799439010'
  const bezorgerProfileId = '607f1f77bcf86cd799439002'
  const templateId = '607f1f77bcf86cd799439001'
  const otherTemplateId = '607f1f77bcf86cd799439099'
  const pharmacyAId = '607f1f77bcf86cd799439011'
  const pharmacyBId = '607f1f77bcf86cd799439012'
  const pharmacyCId = '607f1f77bcf86cd799439013'
  const pharmacyAUserId = '507f1f77bcf86cd799439021'
  const pharmacyBUserId = '507f1f77bcf86cd799439022'
  const pharmacyCUserId = '507f1f77bcf86cd799439023'
  const orderAId = '707f1f77bcf86cd799439031'
  const orderBId = '707f1f77bcf86cd799439032'
  const tomorrow = '2026-07-16'
  const today = '2026-07-15'

  const bezorger: User = {
    _id: bezorgerUserId,
    id: bezorgerUserId,
    firebaseUid: 'firebase-bezorger',
    email: 'bezorger@example.com',
    firstName: 'Bezorger',
    lastName: 'User',
    role: UserRole.BEZORGER,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const apotheker: User = {
    ...bezorger,
    _id: '507f1f77bcf86cd799439099',
    id: '507f1f77bcf86cd799439099',
    role: UserRole.APOTHEKER,
    email: 'apotheker@example.com',
  }

  const admin: User = {
    ...bezorger,
    _id: '507f1f77bcf86cd799439098',
    id: '507f1f77bcf86cd799439098',
    role: UserRole.ADMIN,
    email: 'admin@example.com',
  }

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

  function makeBezorgerProfile(): BezorgerProfile {
    return {
      _id: bezorgerProfileId,
      id: bezorgerProfileId,
      userId: bezorgerUserId,
      displayName: 'Courier One',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  function makeTemplate(
    id: string,
    courierProfileId: string,
    active = true,
  ): RouteTemplate {
    return {
      _id: id,
      id,
      name: `Template ${id.slice(-3)}`,
      normalizedName: `template-${id.slice(-3)}`,
      description: null,
      active,
      bezorgerProfileId: courierProfileId,
      stops: [
        { sequence: 1, apothekerProfileId: pharmacyAId },
        { sequence: 2, apothekerProfileId: pharmacyBId },
        { sequence: 3, apothekerProfileId: pharmacyCId },
      ],
      createdByUserId: 'admin',
      updatedByUserId: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  function makeOrder(
    id: string,
    apothekerId: string,
    status: OrderStatus,
    deliveryDate: string,
    quantity = 10,
    submittedAt: Date = new Date('2026-07-15T11:59:00.000Z'),
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
          quantity,
        },
      ],
      totalQuantity: quantity,
      isoWeek: 29,
      isoYear: 2026,
      // Default: 13:59 Brussels — before 14:00 closing (RULE-013 include path)
      submittedAt,
      deliveryDate,
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  beforeEach(async () => {
    // 2026-07-15 12:00 UTC = 14:00 Europe/Brussels (exactly at closing)
    clockNow = new Date('2026-07-15T12:00:00.000Z')

    routeTemplatesService = {
      findActiveTemplatesForBezorgerProfile: jest
        .fn()
        .mockResolvedValue([makeTemplate(templateId, bezorgerProfileId)]),
    }

    apothekerProfileService = {
      findApothekerProfileById: jest.fn().mockImplementation((id: string) => {
        const map: Record<string, ApothekerProfile> = {
          [pharmacyAId]: makeProfile(pharmacyAId, pharmacyAUserId, 'Apotheek A'),
          [pharmacyBId]: makeProfile(pharmacyBId, pharmacyBUserId, 'Apotheek B'),
          [pharmacyCId]: makeProfile(pharmacyCId, pharmacyCUserId, 'Apotheek C'),
        }
        return Promise.resolve(map[id])
      }),
    }

    bezorgerProfileService = {
      findByUserId: jest.fn().mockResolvedValue(makeBezorgerProfile()),
    }

    orderService = {
      findQualifyingOrdersForRoute: jest.fn().mockResolvedValue([]),
      planOrdersForGeneratedRoute: jest.fn(),
      publishPlannedOrderUpdates: jest.fn(),
    }

    settingsService = {
      getApplicationSettings: jest.fn().mockResolvedValue({
        timezone: 'Europe/Brussels',
        orderingClosingTime: '14:00',
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutePreviewService,
        { provide: RouteTemplatesService, useValue: routeTemplatesService },
        {
          provide: ApothekerProfileService,
          useValue: apothekerProfileService,
        },
        { provide: BezorgerProfileService, useValue: bezorgerProfileService },
        { provide: OrderService, useValue: orderService },
        { provide: SettingsService, useValue: settingsService },
        { provide: CLOCK, useValue: { now: () => clockNow } },
      ],
    }).compile()

    service = module.get(RoutePreviewService)
  })

  describe('tomorrow / cutoff helpers', () => {
    it('computes tomorrow in Europe/Brussels', () => {
      expect(getLocalTomorrowDate(clockNow, 'Europe/Brussels')).toBe(tomorrow)
    })

    it('crosses month boundary', () => {
      const endOfMonth = new Date('2026-07-31T12:00:00.000Z')
      expect(getLocalTomorrowDate(endOfMonth, 'Europe/Brussels')).toBe(
        '2026-08-01',
      )
    })

    it('crosses year boundary', () => {
      const nye = new Date('2025-12-31T12:00:00.000Z')
      expect(getLocalTomorrowDate(nye, 'Europe/Brussels')).toBe('2026-01-01')
    })

    it('handles DST spring-forward weekend in Brussels', () => {
      // 2026-03-28 23:00 UTC = 2026-03-29 00:00 CET (day of spring forward)
      const onDstDay = new Date('2026-03-28T23:00:00.000Z')
      expect(getLocalTomorrowDate(onDstDay, 'Europe/Brussels')).toBe(
        '2026-03-30',
      )
    })

    it('uses configured closing time for delivery-date policy', () => {
      const before = new Date('2026-07-15T11:59:00.000Z')
      const after = new Date('2026-07-15T12:00:00.000Z')

      expect(resolveDeliveryDate(before, 'Europe/Brussels', '14:00')).toBe(today)
      expect(resolveDeliveryDate(after, 'Europe/Brussels', '14:00')).toBe(
        tomorrow,
      )
      expect(resolveDeliveryDate(before, 'Europe/Brussels', '15:30')).toBe(today)
    })
  })

  describe('RULE-013 preview cutoff (submittedAt)', () => {
    it('includes pre-cutoff order scheduled for tomorrow', async () => {
      const preCutoff = new Date('2026-07-15T11:59:00.000Z') // 13:59 Brussels
      orderService.findQualifyingOrdersForRoute.mockImplementation(
        ({ apothekerUserId }) => {
          if (apothekerUserId !== pharmacyAUserId) {
            return Promise.resolve([])
          }

          return Promise.resolve([
            makeOrder(
              orderAId,
              pharmacyAUserId,
              OrderStatus.PENDING,
              tomorrow,
              10,
              preCutoff,
            ),
          ])
        },
      )

      const preview = await service.computeTomorrowPreview(bezorger)

      expect(preview.stops).toHaveLength(1)
      expect(preview.stops[0].orderIds).toEqual([orderAId])
    })

    it('excludes post-cutoff order even when deliveryDate is tomorrow', async () => {
      const postCutoff = new Date('2026-07-15T12:01:00.000Z') // 14:01 Brussels
      orderService.findQualifyingOrdersForRoute.mockImplementation(
        ({ apothekerUserId }) => {
          if (apothekerUserId !== pharmacyAUserId) {
            return Promise.resolve([])
          }

          return Promise.resolve([
            makeOrder(
              orderAId,
              pharmacyAUserId,
              OrderStatus.PENDING,
              tomorrow,
              10,
              postCutoff,
            ),
          ])
        },
      )

      const preview = await service.computeTomorrowPreview(bezorger)

      expect(preview.stops).toEqual([])
      expect(preview.totalOrders).toBe(0)
      expect(preview.skippedApothekerProfileIds).toEqual([
        pharmacyAId,
        pharmacyBId,
        pharmacyCId,
      ])
    })

    it('excludes order submitted exactly at closing (Phase 7 boundary)', async () => {
      const atClosing = new Date('2026-07-15T12:00:00.000Z') // 14:00 Brussels
      orderService.findQualifyingOrdersForRoute.mockImplementation(
        ({ apothekerUserId }) => {
          if (apothekerUserId !== pharmacyAUserId) {
            return Promise.resolve([])
          }

          return Promise.resolve([
            makeOrder(
              orderAId,
              pharmacyAUserId,
              OrderStatus.PENDING,
              tomorrow,
              10,
              atClosing,
            ),
          ])
        },
      )

      const preview = await service.computeTomorrowPreview(bezorger)

      expect(preview.stops).toEqual([])
      expect(preview.totalOrders).toBe(0)
    })

    it('keeps DST-safe Brussels local comparison for cutoff', async () => {
      // Winter: 2026-01-14 12:59 UTC = 13:59 CET — before 14:00
      clockNow = new Date('2026-01-14T12:00:00.000Z')
      const preCutoffWinter = new Date('2026-01-14T12:59:00.000Z')
      const postCutoffWinter = new Date('2026-01-14T13:00:00.000Z')

      orderService.findQualifyingOrdersForRoute.mockImplementation(
        ({ apothekerUserId }) => {
          if (apothekerUserId !== pharmacyAUserId) {
            return Promise.resolve([])
          }

          return Promise.resolve([
            makeOrder(
              orderAId,
              pharmacyAUserId,
              OrderStatus.PENDING,
              '2026-01-15',
              10,
              preCutoffWinter,
            ),
            makeOrder(
              orderBId,
              pharmacyAUserId,
              OrderStatus.PENDING,
              '2026-01-15',
              5,
              postCutoffWinter,
            ),
          ])
        },
      )

      const preview = await service.computeTomorrowPreview(bezorger)

      expect(preview.deliveryDate).toBe('2026-01-15')
      expect(preview.stops).toHaveLength(1)
      expect(preview.stops[0].orderIds).toEqual([orderAId])
      expect(preview.stops[0].totalQuantity).toBe(10)
    })
  })

  describe('template ownership', () => {
    it('resolves current BezorgerProfile and uses its active template', async () => {
      orderService.findQualifyingOrdersForRoute.mockImplementation(
        ({ apothekerUserId }) => {
          if (apothekerUserId === pharmacyAUserId) {
            return Promise.resolve([
              makeOrder(
                orderAId,
                pharmacyAUserId,
                OrderStatus.PENDING,
                tomorrow,
              ),
            ])
          }
          return Promise.resolve([])
        },
      )

      const preview = await service.computeTomorrowPreview(bezorger)

      expect(bezorgerProfileService.findByUserId).toHaveBeenCalledWith(
        bezorgerUserId,
      )
      expect(
        routeTemplatesService.findActiveTemplatesForBezorgerProfile,
      ).toHaveBeenCalledWith(bezorgerProfileId)
      expect(preview.routeTemplateId).toBe(templateId)
      expect(preview.bezorgerProfileId).toBe(bezorgerProfileId)
      expect(preview.deliveryDate).toBe(tomorrow)
    })

    it('ignores inactive templates via active-only lookup', async () => {
      routeTemplatesService.findActiveTemplatesForBezorgerProfile.mockResolvedValue(
        [],
      )

      await expect(service.computeTomorrowPreview(bezorger)).rejects.toBeInstanceOf(
        RouteTemplateNotAssignedException,
      )
    })

    it('throws when no active template is assigned', async () => {
      routeTemplatesService.findActiveTemplatesForBezorgerProfile.mockResolvedValue(
        [],
      )

      await expect(service.computeTomorrowPreview(bezorger)).rejects.toMatchObject(
        { response: { error: 'ROUTE_TEMPLATE_NOT_ASSIGNED' } },
      )
    })

    it('throws when multiple active templates exist', async () => {
      routeTemplatesService.findActiveTemplatesForBezorgerProfile.mockResolvedValue(
        [
          makeTemplate(templateId, bezorgerProfileId),
          makeTemplate(otherTemplateId, bezorgerProfileId),
        ],
      )

      await expect(service.computeTomorrowPreview(bezorger)).rejects.toMatchObject(
        {
          response: { error: 'ROUTE_TEMPLATE_MULTIPLE_ACTIVE_FOR_COURIER' },
        },
      )
    })

    it('never uses another courier template', async () => {
      const otherCourierId = '607f1f77bcf86cd799439088'
      routeTemplatesService.findActiveTemplatesForBezorgerProfile.mockResolvedValue(
        [makeTemplate(templateId, otherCourierId)],
      )

      const preview = await service.computeTomorrowPreview(bezorger)

      expect(
        routeTemplatesService.findActiveTemplatesForBezorgerProfile,
      ).toHaveBeenCalledWith(bezorgerProfileId)
      expect(preview.bezorgerProfileId).toBe(bezorgerProfileId)
    })

    it('throws when BezorgerProfile is missing', async () => {
      bezorgerProfileService.findByUserId.mockResolvedValue(null)

      await expect(service.computeTomorrowPreview(bezorger)).rejects.toBeInstanceOf(
        BezorgerProfileNotFoundException,
      )
    })
  })

  describe('stops and orders', () => {
    beforeEach(() => {
      orderService.findQualifyingOrdersForRoute.mockImplementation(
        ({ apothekerUserId, deliveryDate }) => {
          if (deliveryDate !== tomorrow) {
            return Promise.resolve([])
          }

          if (apothekerUserId === pharmacyAUserId) {
            return Promise.resolve([
              makeOrder(
                orderAId,
                pharmacyAUserId,
                OrderStatus.PENDING,
                tomorrow,
                10,
              ),
              makeOrder(
                orderBId,
                pharmacyAUserId,
                OrderStatus.PLANNED,
                tomorrow,
                5,
              ),
            ])
          }

          if (apothekerUserId === pharmacyCUserId) {
            return Promise.resolve([
              makeOrder(
                '707f1f77bcf86cd799439033',
                pharmacyCUserId,
                OrderStatus.PENDING,
                tomorrow,
                7,
              ),
            ])
          }

          return Promise.resolve([])
        },
      )
    })

    it('includes matching pharmacies and skips those without orders', async () => {
      const preview = await service.computeTomorrowPreview(bezorger)

      expect(preview.stops.map(s => s.apothekerProfileId)).toEqual([
        pharmacyAId,
        pharmacyCId,
      ])
      expect(preview.skippedApothekerProfileIds).toEqual([pharmacyBId])
    })

    it('preserves relative template order and renormalizes sequence', async () => {
      const preview = await service.computeTomorrowPreview(bezorger)

      expect(preview.stops.map(s => s.sequence)).toEqual([1, 2])
      expect(preview.stops[0].pharmacyName).toBe('Apotheek A')
      expect(preview.stops[1].pharmacyName).toBe('Apotheek C')
    })

    it('aggregates vaccine quantities and calculates totals', async () => {
      const preview = await service.computeTomorrowPreview(bezorger)

      expect(preview.stops[0].orderCount).toBe(2)
      expect(preview.stops[0].totalQuantity).toBe(15)
      expect(preview.stops[0].lines[0].quantity).toBe(15)
      expect(preview.stops[0].orderIds).toEqual([orderAId, orderBId])
      expect(preview.totalStops).toBe(2)
      expect(preview.totalOrders).toBe(3)
      expect(preview.totalQuantity).toBe(22)
    })

    it('queries only tomorrow deliveryDate (excludes wrong date)', async () => {
      await service.computeTomorrowPreview(bezorger)

      for (const call of orderService.findQualifyingOrdersForRoute.mock.calls) {
        expect(call[0].deliveryDate).toBe(tomorrow)
      }
    })

    it('passes pharmacist userId ownership bridge into qualifying lookup', async () => {
      await service.computeTomorrowPreview(bezorger)

      expect(orderService.findQualifyingOrdersForRoute).toHaveBeenCalledWith({
        apothekerUserId: pharmacyAUserId,
        deliveryDate: tomorrow,
      })
      expect(orderService.findQualifyingOrdersForRoute).toHaveBeenCalledWith({
        apothekerUserId: pharmacyBUserId,
        deliveryDate: tomorrow,
      })
    })
  })

  describe('no persistence / no side effects', () => {
    it('does not plan orders, publish updates, or touch DeliveryRoute', async () => {
      await service.computeTomorrowPreview(bezorger)

      expect(orderService.planOrdersForGeneratedRoute).not.toHaveBeenCalled()
      expect(orderService.publishPlannedOrderUpdates).not.toHaveBeenCalled()
      expect(orderService.findQualifyingOrdersForRoute).toHaveBeenCalled()
    })
  })

  describe('empty preview', () => {
    it('returns a valid empty preview with skipped profile ids', async () => {
      const preview = await service.computeTomorrowPreview(bezorger)

      expect(preview.stops).toEqual([])
      expect(preview.totalStops).toBe(0)
      expect(preview.totalOrders).toBe(0)
      expect(preview.totalQuantity).toBe(0)
      expect(preview.skippedApothekerProfileIds).toEqual([
        pharmacyAId,
        pharmacyBId,
        pharmacyCId,
      ])
      expect(preview.routeTemplateId).toBe(templateId)
      expect(preview.deliveryDate).toBe(tomorrow)
    })
  })

  describe('authorization', () => {
    it('allows BEZORGER', async () => {
      await expect(
        service.computeTomorrowPreview(bezorger),
      ).resolves.toBeDefined()
    })

    it('forbids APOTHEKER', async () => {
      await expect(
        service.computeTomorrowPreview(apotheker),
      ).rejects.toBeInstanceOf(DeliveryRouteForbiddenException)
    })

    it('forbids ADMIN', async () => {
      await expect(service.computeTomorrowPreview(admin)).rejects.toBeInstanceOf(
        DeliveryRouteForbiddenException,
      )
    })
  })
})
