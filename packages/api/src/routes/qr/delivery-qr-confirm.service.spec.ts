import { ObjectId } from 'mongodb'

import { OrderStatus } from '../../order/order-status.enum'
import { UserRole } from '../../user/user-role.enum'
import { RouteStatus } from '../route-status.enum'
import {
  DELIVERY_QR_TEST_SIGNING_SECRET,
  DELIVERY_QR_TOKEN_VERSION,
} from './delivery-qr.constants'
import { DeliveryQrConfirmService } from './delivery-qr-confirm.service'
import {
  DeliveryQrConfirmForbiddenException,
  DeliveryQrConfirmOrderIntegrityException,
  DeliveryQrConfirmRouteNotStartedException,
  DeliveryQrConfirmTokenRequiredException,
} from './delivery-qr-confirm.exceptions'
import { generateDeliveryQrNonce, hashDeliveryQrNonce } from './delivery-qr-nonce.util'
import { HmacDeliveryQrTokenService } from './hmac-delivery-qr-token.service'
import { StopConfirmationProcessState } from './stop-confirmation-process.embed'

const tokenService = new HmacDeliveryQrTokenService(DELIVERY_QR_TEST_SIGNING_SECRET)

describe('DeliveryQrConfirmService', () => {
  const courierUserId = new ObjectId()
  const pharmacyUserId = new ObjectId()
  const pharmacyProfileId = new ObjectId().toString()
  const routeId = new ObjectId()
  const orderId = new ObjectId().toString()
  const stopId = 'stop-confirm-1'
  const nonce = generateDeliveryQrNonce()

  const actor = {
    _id: courierUserId,
    role: UserRole.BEZORGER,
  } as never

  function buildRoute(overrides?: {
    status?: RouteStatus
    consumed?: boolean
    processing?: boolean
    confirmationEventId?: string
  }) {
    const encodedToken = tokenService.sign({
      routeId: routeId.toString(),
      stopId,
      nonce,
      version: DELIVERY_QR_TOKEN_VERSION,
    })

    return {
      _id: routeId,
      status: overrides?.status ?? RouteStatus.IN_PROGRESS,
      bezorgerProfileId: new ObjectId(),
      deliveryDate: '2026-07-26',
      stops: [
        {
          stopId,
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
          orderIds: [orderId],
          orderCount: 1,
          totalQuantity: 3,
          lines: [],
          qrConfirmation: {
            tokenVersion: DELIVERY_QR_TOKEN_VERSION,
            nonceHash: hashDeliveryQrNonce(nonce),
            encodedToken,
            issuedAt: new Date('2026-07-26T08:00:00.000Z'),
            consumedAt: overrides?.consumed ? new Date() : null,
            consumedByUserId: overrides?.consumed
              ? courierUserId.toString()
              : null,
          },
          deliveryProof: null,
          confirmationProcess: overrides?.processing
            ? {
                state: StopConfirmationProcessState.PROCESSING,
                confirmationEventId:
                  overrides.confirmationEventId ?? 'evt-existing',
                claimedAt: new Date('2026-07-26T09:00:00.000Z'),
                claimedByUserId: courierUserId.toString(),
                lastUpdatedAt: new Date('2026-07-26T09:00:00.000Z'),
              }
            : null,
        },
      ],
    }
  }

  function buildService(deps: {
    route?: ReturnType<typeof buildRoute> | null
    order?: {
      _id: ObjectId
      apothekerId: string
      status: OrderStatus
      orderLines: unknown[]
      deliveryConfirmationEventId?: string | null
      deliveryMethod?: string | null
    } | null
    profileId?: string
  }) {
    const route = deps.route === undefined ? buildRoute() : deps.route
    const encodedToken = route?.stops[0]?.qrConfirmation?.encodedToken ?? ''
    let currentRoute = route

    const deliveryRouteRepository = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(currentRoute)),
      findOneAndUpdate: jest.fn().mockImplementation((_filter, update) => {
        const set = (update as { $set?: { 'stops.$'?: unknown } }).$set
        if (currentRoute && set?.['stops.$']) {
          currentRoute = {
            ...currentRoute,
            stops: [set['stops.$'] as (typeof currentRoute.stops)[0]],
          }
        }
        return Promise.resolve(currentRoute)
      }),
    }

    const order =
      deps.order === undefined
        ? {
            _id: new ObjectId(orderId),
            apothekerId: pharmacyUserId.toString(),
            status: OrderStatus.PENDING,
            orderLines: [{ vaccineId: 'v1', vaccineName: 'Flu', quantity: 3 }],
            deliveryConfirmationEventId: null,
            deliveryMethod: null,
          }
        : deps.order

    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
    }

    const bezorgerProfileService = {
      findByUserId: jest.fn().mockResolvedValue({
        id: deps.profileId ?? route?.bezorgerProfileId,
      }),
    }

    const orderService = {
      markDeliveredForQrConfirmation: jest
        .fn()
        .mockImplementation(
          (_actor: unknown, _ids: string[], eventId: string) =>
            Promise.resolve([
              {
                ...order,
                status: OrderStatus.DELIVERED,
                deliveryConfirmationEventId: eventId,
                deliveryMethod: 'QR',
              },
            ]),
        ),
      publishQrDeliveredOrderUpdates: jest.fn().mockResolvedValue(undefined),
    }

    const deliveryRouteEventsService = {
      publishBezorgerRouteUpdated: jest.fn().mockResolvedValue(undefined),
    }

    const auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    }

    const businessNotificationProducer = {
      notifyPharmacyDeliveryConfirmed: jest.fn().mockResolvedValue(undefined),
      notifyNextPharmacy: jest.fn().mockResolvedValue(undefined),
    }

    const progressLocationService = {
      recordDeliveryLocation: jest.fn().mockImplementation(
        (input: { route: typeof currentRoute }) =>
          Promise.resolve({
            route: input.route,
            applied: true,
            location: null,
            nextStop: null,
            published: false,
          }),
      ),
      deriveNextStop: jest.fn().mockReturnValue(null),
    }

    const service = new DeliveryQrConfirmService(
      deliveryRouteRepository as never,
      orderRepository as never,
      bezorgerProfileService as never,
      orderService as never,
      deliveryRouteEventsService as never,
      auditService as never,
      businessNotificationProducer as never,
      progressLocationService as never,
      tokenService,
    )

    return {
      service,
      encodedToken,
      orderService,
      deliveryRouteEventsService,
      auditService,
      businessNotificationProducer,
      deliveryRouteRepository,
    }
  }

  it('requires a token', async () => {
    const { service } = buildService({})
    await expect(service.confirmForCourier(actor, { token: '' })).rejects.toBeInstanceOf(
      DeliveryQrConfirmTokenRequiredException,
    )
  })

  it('rejects non-assigned courier', async () => {
    const { service, encodedToken } = buildService({
      profileId: new ObjectId().toString(),
    })
    await expect(
      service.confirmForCourier(actor, { token: encodedToken }),
    ).rejects.toBeInstanceOf(DeliveryQrConfirmForbiddenException)
  })

  it('rejects ASSIGNED routes', async () => {
    const { service, encodedToken } = buildService({
      route: buildRoute({ status: RouteStatus.ASSIGNED }),
    })
    await expect(
      service.confirmForCourier(actor, { token: encodedToken }),
    ).rejects.toBeInstanceOf(DeliveryQrConfirmRouteNotStartedException)
  })

  it('rejects cancelled order integrity failures before claim', async () => {
    const { service, encodedToken, deliveryRouteRepository, auditService } =
      buildService({
        order: {
          _id: new ObjectId(orderId),
          apothekerId: pharmacyUserId.toString(),
          status: OrderStatus.CANCELLED,
          orderLines: [],
        },
      })

    await expect(
      service.confirmForCourier(actor, { token: encodedToken }),
    ).rejects.toBeInstanceOf(DeliveryQrConfirmOrderIntegrityException)
    expect(deliveryRouteRepository.findOneAndUpdate).not.toHaveBeenCalled()
    expect(auditService.record).not.toHaveBeenCalled()
  })

  it('confirms a valid stop and emits events after finalisation', async () => {
    const {
      service,
      encodedToken,
      orderService,
      deliveryRouteEventsService,
      auditService,
    } = buildService({})

    const result = await service.confirmForCourier(actor, { token: encodedToken })

    expect(result.routeId).toBe(routeId.toString())
    expect(result.stopId).toBe(stopId)
    expect(result.orderIds).toEqual([orderId])
    expect(result.proofMethod).toBe('QR')
    expect(result.recipientCity).toBe('Brugge')
    expect(orderService.markDeliveredForQrConfirmation).toHaveBeenCalled()
    expect(auditService.record).toHaveBeenCalledTimes(1)
    expect(deliveryRouteEventsService.publishBezorgerRouteUpdated).toHaveBeenCalledTimes(1)
    expect(orderService.publishQrDeliveredOrderUpdates).toHaveBeenCalledTimes(1)
  })

  it('resumes an existing PROCESSING claim without creating a second event id', async () => {
    const existingEventId = 'evt-resume-1'
    const { service, encodedToken, orderService, auditService } = buildService({
      route: buildRoute({
        processing: true,
        confirmationEventId: existingEventId,
      }),
    })

    await service.confirmForCourier(actor, { token: encodedToken })

    expect(orderService.markDeliveredForQrConfirmation).toHaveBeenCalledWith(
      actor,
      [orderId],
      existingEventId,
    )
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ confirmationEventId: existingEventId }),
    )
  })
})
