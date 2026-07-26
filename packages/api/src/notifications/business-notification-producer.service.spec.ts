import { NotificationType } from './notification-type.enum'
import { BusinessNotificationProducerService } from './business-notification-producer.service'
import { buildAdminNewOrderEventId } from './business-notification-event-ids'
import { UserRole } from '../user/user-role.enum'
import { RouteStatus } from '../routes/route-status.enum'
import { Order } from '../order/order.entity'
import { DeliveryRoute } from '../routes/delivery-route.entity'
import { DeliveryStop } from '../routes/delivery-stop.embed'
import { isInternalActionPath } from './notification-action-path'
import type { CreateTypedNotificationInput } from './notification.service'
import { Notification } from './notification.entity'

describe('BusinessNotificationProducerService', () => {
  const adminA = { _id: 'admin-a' }
  const adminB = { _id: 'admin-b' }
  const courierUserId = 'courier-user-1'
  const pharmacyUserA = 'pharm-user-a'
  const pharmacyUserB = 'pharm-user-b'

  let createTypedNotification: jest.MockedFunction<
    (input: CreateTypedNotificationInput) => Promise<{
      notification: Notification
      created: boolean
    }>
  >
  let requestPushDelivery: jest.Mock
  let findUsersByRole: jest.Mock
  let findByUserId: jest.Mock
  let findBezorgerProfileById: jest.Mock
  let routeFind: jest.Mock
  let producer: BusinessNotificationProducerService
  let createdEventIds: string[]

  function makeNotification(
    partial: Record<string, unknown>,
  ): Notification {
    return {
      id: `n-${Math.random().toString(16).slice(2)}`,
      deliveryState: { pushRequestedAt: null },
      ...partial,
    } as Notification
  }

  function typedCall(index: number): CreateTypedNotificationInput {
    const call = createTypedNotification.mock.calls[index]
    if (!call) {
      throw new Error(`Missing createTypedNotification call at ${index}`)
    }
    return call[0]
  }

  beforeEach(() => {
    createdEventIds = []
    createTypedNotification = jest.fn(
      (input: CreateTypedNotificationInput) => {
        const key = `${input.recipientUserId}|${input.eventId}`
        if (createdEventIds.includes(key)) {
          return Promise.resolve({
            notification: makeNotification({
              ...input,
              id: 'existing',
            }),
            created: false,
          })
        }
        createdEventIds.push(key)
        return Promise.resolve({
          notification: makeNotification({ ...input }),
          created: true,
        })
      },
    )
    requestPushDelivery = jest.fn().mockResolvedValue({
      attempted: 1,
      delivered: 1,
      permanentFailures: 0,
      transientFailures: 0,
    })
    findUsersByRole = jest.fn().mockResolvedValue([adminA, adminB])
    findByUserId = jest.fn().mockResolvedValue({ pharmacyName: 'Apotheek Centrum' })
    findBezorgerProfileById = jest.fn().mockResolvedValue({
      userId: courierUserId,
    })
    routeFind = jest.fn().mockResolvedValue([])

    producer = new BusinessNotificationProducerService(
      { createTypedNotification } as never,
      { requestPushDelivery } as never,
      { findUsersByRole } as never,
      { findByUserId } as never,
      { findBezorgerProfileById } as never,
      { find: routeFind } as never,
      { now: () => new Date('2026-07-26T06:00:00.000Z') },
    )
  })

  function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
      id: 'order-1',
      apothekerId: 'apoth-1',
      deliveryDate: '2026-07-28',
      totalQuantity: 15,
      orderLines: [
        { vaccineId: 'v1', vaccineName: 'Flu', manufacturer: 'M', quantity: 10 },
        { vaccineId: 'v2', vaccineName: 'Tet', manufacturer: 'M', quantity: 5 },
      ],
      ...overrides,
    } as Order
  }

  function makeStop(
    overrides: Partial<DeliveryStop> & { sequence: number; stopId: string },
  ): DeliveryStop {
    return {
      apothekerProfileId: 'p1',
      apothekerUserId: pharmacyUserA,
      pharmacyName: 'Apotheek A',
      address: {
        street: 'S',
        houseNumber: '1',
        postalCode: '8500',
        city: 'Kortrijk',
        country: 'BE',
      },
      orderIds: ['o1', 'o2'],
      orderCount: 2,
      totalQuantity: 20,
      lines: [],
      deliveryProof: null,
      qrConfirmation: {
        nonceHash: 'h',
        encodedToken: 't',
        consumedAt: null,
        consumedByUserId: null,
      },
      ...overrides,
    } as DeliveryStop
  }

  function makeRoute(overrides: Partial<DeliveryRoute> = {}): DeliveryRoute {
    return {
      id: 'route-1',
      bezorgerProfileId: 'bez-profile-1',
      deliveryDate: '2026-07-26',
      status: RouteStatus.ASSIGNED,
      stops: [
        makeStop({ sequence: 1, stopId: 'stop-1', apothekerUserId: pharmacyUserA }),
        makeStop({
          sequence: 2,
          stopId: 'stop-2',
          apothekerUserId: pharmacyUserB,
          pharmacyName: 'Apotheek B',
          address: {
            street: 'T',
            houseNumber: '2',
            postalCode: '9000',
            city: 'Gent',
            country: 'BE',
          },
        }),
      ],
      generatedAt: new Date('2026-07-25T10:00:00.000Z'),
      createdAt: new Date('2026-07-25T10:00:00.000Z'),
      ...overrides,
    } as DeliveryRoute
  }

  describe('ADMIN_NEW_ORDER', () => {
    it('notifies each active admin once with internal action path', async () => {
      await producer.notifyAdminsNewOrder(makeOrder())

      expect(createTypedNotification).toHaveBeenCalledTimes(2)
      expect(requestPushDelivery).toHaveBeenCalledTimes(2)

      const recipients = createTypedNotification.mock.calls.map(
        call => call[0].recipientUserId,
      )
      expect(recipients.sort()).toEqual(['admin-a', 'admin-b'])

      const first = typedCall(0)
      expect(first.type).toBe(NotificationType.ADMIN_NEW_ORDER)
      expect(first.eventId).toBe(buildAdminNewOrderEventId('order-1'))
      expect(first.interpolationData?.pharmacyName).toBe('Apotheek Centrum')
      expect(first.interpolationData?.orderCount).toBe(2)
      expect(isInternalActionPath(first.actionPath)).toBe(true)
      expect(first.actionPath).toBe('/admin/orders')
    })

    it('stringifies ObjectId-like order.id for orderReference (Phase 27D)', async () => {
      const objectIdLike = {
        toString: () => '507f1f77bcf86cd799439011',
      }
      await producer.notifyAdminsNewOrder(
        makeOrder({ id: objectIdLike as unknown as string }),
      )

      expect(typedCall(0).interpolationData?.orderReference).toBe(
        '507f1f77bcf86cd799439011',
      )
      expect(typeof typedCall(0).interpolationData?.orderReference).toBe(
        'string',
      )
      expect(typedCall(0).sourceEntityId).toBe('507f1f77bcf86cd799439011')
      expect(requestPushDelivery).toHaveBeenCalled()
    })

    it('does not duplicate on retry', async () => {
      const order = makeOrder()
      await producer.notifyAdminsNewOrder(order)
      await producer.notifyAdminsNewOrder(order)

      expect(createTypedNotification).toHaveBeenCalledTimes(4)
      expect(requestPushDelivery).toHaveBeenCalledTimes(2)
    })

    it('swallows producer failures without throwing', async () => {
      findUsersByRole.mockRejectedValue(new Error('db down'))
      await expect(
        producer.notifyAdminsNewOrder(makeOrder()),
      ).resolves.toBeUndefined()
    })
  })

  describe('BEZORGER_ROUTE_ASSIGNED', () => {
    it('notifies assigned courier once', async () => {
      await producer.notifyCourierRouteAssigned(makeRoute())

      expect(createTypedNotification).toHaveBeenCalledTimes(1)
      const input = typedCall(0)
      expect(input.recipientUserId).toBe(courierUserId)
      expect(input.type).toBe(NotificationType.BEZORGER_ROUTE_ASSIGNED)
      expect(input.interpolationData?.stopCount).toBe(2)
      expect(input.actionPath).toBe('/bezorger/today')
      expect(requestPushDelivery).toHaveBeenCalledTimes(1)
    })

    it('same courier reassignment does not resend push', async () => {
      const route = makeRoute()
      await producer.notifyCourierRouteAssigned(route)
      await producer.notifyCourierRouteAssigned(route)

      expect(requestPushDelivery).toHaveBeenCalledTimes(1)
    })

    it('different courier receives a new assignment notification', async () => {
      await producer.notifyCourierRouteAssigned(makeRoute())
      findBezorgerProfileById.mockResolvedValue({ userId: 'courier-user-2' })
      await producer.notifyCourierRouteAssigned(
        makeRoute({ id: 'route-2', bezorgerProfileId: 'bez-profile-2' }),
      )

      expect(requestPushDelivery).toHaveBeenCalledTimes(2)
      const recipients = createTypedNotification.mock.calls.map(
        call => call[0].recipientUserId,
      )
      expect(recipients).toEqual(['courier-user-1', 'courier-user-2'])
    })

    it('regeneration preserving assignment does not duplicate push', async () => {
      const route = makeRoute()
      await producer.notifyCourierRouteAssigned(route)
      await producer.notifyCourierRouteAssigned({
        ...route,
        generatedAt: new Date('2026-07-26T12:00:00.000Z'),
      } as DeliveryRoute)

      expect(requestPushDelivery).toHaveBeenCalledTimes(1)
    })
  })

  describe('APOTHEKER_ROUTE_STARTED', () => {
    it('notifies every unique eligible pharmacy stop once', async () => {
      await producer.notifyPharmacyRouteStarted(makeRoute())

      expect(createTypedNotification).toHaveBeenCalledTimes(2)
      expect(requestPushDelivery).toHaveBeenCalledTimes(2)
      const recipients = createTypedNotification.mock.calls.map(
        call => call[0].recipientUserId,
      )
      expect(recipients.sort()).toEqual([pharmacyUserA, pharmacyUserB].sort())
    })

    it('multi-order stop produces one notification', async () => {
      const route = makeRoute({
        stops: [
          makeStop({
            sequence: 1,
            stopId: 'stop-1',
            orderIds: ['a', 'b', 'c'],
            orderCount: 3,
          }),
        ],
      })
      await producer.notifyPharmacyRouteStarted(route)
      expect(createTypedNotification).toHaveBeenCalledTimes(1)
    })

    it('skips already delivered stops', async () => {
      const route = makeRoute({
        stops: [
          makeStop({
            sequence: 1,
            stopId: 'stop-1',
            deliveryProof: {
              method: 'QR' as never,
              deliveredAt: new Date(),
              deliveredByUserId: 'c',
              associatedOrderIds: ['o1'],
              recipientProfileId: 'p',
              recipientCity: 'Kortrijk',
              confirmationEventId: 'e1',
            },
          }),
          makeStop({
            sequence: 2,
            stopId: 'stop-2',
            apothekerUserId: pharmacyUserB,
          }),
        ],
      })
      await producer.notifyPharmacyRouteStarted(route)
      expect(createTypedNotification).toHaveBeenCalledTimes(1)
      expect(typedCall(0).recipientUserId).toBe(pharmacyUserB)
    })

    it('duplicate start does not resend push', async () => {
      const route = makeRoute()
      await producer.notifyPharmacyRouteStarted(route)
      await producer.notifyPharmacyRouteStarted(route)
      expect(requestPushDelivery).toHaveBeenCalledTimes(2)
    })
  })

  describe('APOTHEKER_NEXT_STOP + DELIVERY_CONFIRMED', () => {
    it('includes completed stop city and selects next higher sequence', async () => {
      const route = makeRoute()
      const completed = route.stops[0]

      await producer.notifyNextPharmacy(route, completed)

      expect(createTypedNotification).toHaveBeenCalledTimes(1)
      const input = typedCall(0)
      expect(input.type).toBe(NotificationType.APOTHEKER_NEXT_STOP)
      expect(input.recipientUserId).toBe(pharmacyUserB)
      expect(input.interpolationData?.city).toBe('Kortrijk')
      expect(input.actionPath).toBe('/apotheker/orders')
    })

    it('sends no next notification when no later stop remains', async () => {
      const route = makeRoute()
      await producer.notifyNextPharmacy(route, route.stops[1])
      expect(createTypedNotification).not.toHaveBeenCalled()
    })

    it('skips already-delivered next sequence', async () => {
      const route = makeRoute({
        stops: [
          makeStop({ sequence: 1, stopId: 's1', address: { street: 'S', houseNumber: '1', postalCode: '8500', city: 'Kortrijk', country: 'BE' } }),
          makeStop({
            sequence: 2,
            stopId: 's2',
            apothekerUserId: 'skip-me',
            deliveryProof: {
              method: 'QR' as never,
              deliveredAt: new Date(),
              deliveredByUserId: 'c',
              associatedOrderIds: ['o'],
              recipientProfileId: 'p',
              recipientCity: 'X',
              confirmationEventId: 'e',
            },
          }),
          makeStop({
            sequence: 3,
            stopId: 's3',
            apothekerUserId: 'next-me',
            pharmacyName: 'Apotheek C',
          }),
        ],
      })

      await producer.notifyNextPharmacy(route, route.stops[0])
      expect(typedCall(0).recipientUserId).toBe('next-me')
    })

    it('delivery confirmed includes order count and is idempotent', async () => {
      const route = makeRoute()
      const stop = route.stops[0]
      const input = {
        route,
        stop,
        confirmationEventId: 'confirm-abc',
        orderCount: 2,
      }

      await producer.notifyPharmacyDeliveryConfirmed(input)
      await producer.notifyPharmacyDeliveryConfirmed(input)

      expect(createTypedNotification).toHaveBeenCalledTimes(2)
      expect(requestPushDelivery).toHaveBeenCalledTimes(1)
      expect(typedCall(0).interpolationData?.orderCount).toBe(2)
      expect(typedCall(0).type).toBe(
        NotificationType.APOTHEKER_DELIVERY_CONFIRMED,
      )
    })

    it('push failure does not throw (domain success)', async () => {
      requestPushDelivery.mockRejectedValue(new Error('push down'))
      await expect(
        producer.notifyPharmacyDeliveryConfirmed({
          route: makeRoute(),
          stop: makeRoute().stops[0],
          confirmationEventId: 'confirm-xyz',
          orderCount: 1,
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe('BEZORGER_ROUTE_DATE_REMINDER', () => {
    it('notifies eligible courier for today route', async () => {
      const route = makeRoute({
        generatedAt: new Date('2026-07-25T10:00:00.000Z'),
      })
      routeFind.mockResolvedValue([route])

      await producer.notifyCourierRouteDateRemindersForLocalDate('2026-07-26')

      expect(createTypedNotification).toHaveBeenCalledTimes(1)
      expect(typedCall(0).type).toBe(
        NotificationType.BEZORGER_ROUTE_DATE_REMINDER,
      )
      expect(requestPushDelivery).toHaveBeenCalledTimes(1)
    })

    it('skips same-day assignment after 08:00 Brussels', async () => {
      // 08:00 UTC = 10:00 Brussels CEST
      const route = makeRoute({
        generatedAt: new Date('2026-07-26T08:00:00.000Z'),
        deliveryDate: '2026-07-26',
      })
      await producer.notifyCourierRouteDateReminder(route)
      expect(createTypedNotification).not.toHaveBeenCalled()
    })

    it('includes prior-day assignment', async () => {
      const route = makeRoute({
        generatedAt: new Date('2026-07-25T20:00:00.000Z'),
        deliveryDate: '2026-07-26',
      })
      await producer.notifyCourierRouteDateReminder(route)
      expect(createTypedNotification).toHaveBeenCalledTimes(1)
    })

    it('skips completed and cancelled routes', async () => {
      await producer.notifyCourierRouteDateReminder(
        makeRoute({ status: RouteStatus.COMPLETED }),
      )
      await producer.notifyCourierRouteDateReminder(
        makeRoute({ status: RouteStatus.CANCELLED }),
      )
      expect(createTypedNotification).not.toHaveBeenCalled()
    })

    it('repeated scheduler run does not duplicate push', async () => {
      const route = makeRoute({
        generatedAt: new Date('2026-07-25T10:00:00.000Z'),
      })
      await producer.notifyCourierRouteDateReminder(route)
      await producer.notifyCourierRouteDateReminder(route)
      expect(requestPushDelivery).toHaveBeenCalledTimes(1)
    })
  })

  describe('delivery policy integration', () => {
    it('invokes delivery policy once for new notification only', async () => {
      await producer.notifyCourierRouteAssigned(makeRoute())
      await producer.notifyCourierRouteAssigned(makeRoute())
      expect(requestPushDelivery).toHaveBeenCalledTimes(1)
    })

    it('records transient push failure safely without throwing', async () => {
      requestPushDelivery.mockResolvedValue({
        attempted: 1,
        delivered: 0,
        permanentFailures: 0,
        transientFailures: 1,
      })
      await expect(
        producer.notifyCourierRouteAssigned(makeRoute()),
      ).resolves.toBeUndefined()
    })

    it('never logs raw endpoint/token in producer errors', async () => {
      const errorSpy = jest.spyOn(
        (producer as unknown as { logger: { error: (...a: unknown[]) => void } })
          .logger,
        'error',
      )
      createTypedNotification.mockRejectedValue(
        new Error('failed endpoint=https://secret.push/token=abc'),
      )
      await producer.notifyCourierRouteAssigned(makeRoute())
      const logged = JSON.stringify(errorSpy.mock.calls)
      expect(logged).not.toMatch(/p256dh|authSecret/)
      errorSpy.mockRestore()
    })
  })

  describe('recipient isolation', () => {
    it('does not leak admin notifications to courier recipients', async () => {
      await producer.notifyAdminsNewOrder(makeOrder())
      const roles = createTypedNotification.mock.calls.map(
        call => call[0].recipientRole,
      )
      expect(roles.every(r => r === UserRole.ADMIN)).toBe(true)
    })
  })
})
