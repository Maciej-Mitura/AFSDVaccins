import { ObjectId } from 'mongodb'

import { OrderStatus } from '../../order/order-status.enum'
import { UserRole } from '../../user/user-role.enum'
import { User } from '../../user/user.entity'
import { DeliveryRoute } from '../delivery-route.entity'
import { RouteStatus } from '../route-status.enum'
import {
  DELIVERY_QR_TEST_SIGNING_SECRET,
  DELIVERY_QR_TOKEN_VERSION,
} from './delivery-qr.constants'
import { DELIVERY_QR_PREVIEW_TOKEN_MAX_LENGTH } from './delivery-qr-preview.constants'
import {
  DeliveryQrOrderIntegrityException,
  DeliveryQrPreviewConsumedException,
  DeliveryQrPreviewForbiddenException,
  DeliveryQrPreviewRouteInactiveException,
  DeliveryQrPreviewTokenInvalidException,
  DeliveryQrRouteNotStartedException,
  DeliveryQrStopAlreadyDeliveredException,
  DeliveryQrTokenRequiredException,
} from './delivery-qr-preview.exceptions'
import { DeliveryQrPreviewService } from './delivery-qr-preview.service'
import { DeliveryProofMethod } from './delivery-proof-method.enum'
import { generateDeliveryQrNonce, hashDeliveryQrNonce } from './delivery-qr-nonce.util'
import { HmacDeliveryQrTokenService } from './hmac-delivery-qr-token.service'

const tokenService = new HmacDeliveryQrTokenService(DELIVERY_QR_TEST_SIGNING_SECRET)

function courierUser(id: ObjectId = new ObjectId()): User {
  return {
    _id: id,
    role: UserRole.BEZORGER,
  } as unknown as User
}

describe('DeliveryQrPreviewService', () => {
  const routeId = new ObjectId()
  const stopId = 'stop-preview-1'
  const pharmacyUserId = new ObjectId()
  const orderId = new ObjectId()
  const courierProfileId = new ObjectId()
  const courierUserId = new ObjectId()
  const nonce = generateDeliveryQrNonce()
  const encodedToken = tokenService.sign({
    routeId: routeId.toHexString(),
    stopId,
    nonce,
  })

  function makeRoute(overrides?: {
    status?: RouteStatus
    bezorgerProfileId?: string
    consumed?: boolean
    delivered?: boolean
    orderIds?: string[]
    secondStop?: boolean
  }): DeliveryRoute {
    const stop = {
      stopId,
      sequence: 1,
      apothekerProfileId: new ObjectId().toString(),
      apothekerUserId: pharmacyUserId.toString(),
      pharmacyName: 'Apotheek Centrum',
      address: {
        street: 'Markt',
        houseNumber: '12',
        postalCode: '8000',
        city: 'Brugge',
        country: 'BE',
      },
      orderIds: overrides?.orderIds ?? [orderId.toHexString()],
      orderCount: 1,
      totalQuantity: 3,
      lines: [],
      qrConfirmation: {
        tokenVersion: DELIVERY_QR_TOKEN_VERSION,
        nonceHash: hashDeliveryQrNonce(nonce),
        encodedToken,
        issuedAt: new Date('2026-07-26T08:00:00.000Z'),
        consumedAt: overrides?.consumed ? new Date('2026-07-26T10:00:00.000Z') : null,
        consumedByUserId: overrides?.consumed ? courierUserId.toString() : null,
      },
      deliveryProof: overrides?.delivered
        ? {
            method: DeliveryProofMethod.QR,
            deliveredAt: new Date('2026-07-26T10:00:00.000Z'),
            deliveredByUserId: courierUserId.toString(),
            associatedOrderIds: [orderId.toHexString()],
            recipientProfileId: new ObjectId().toString(),
            recipientCity: 'Brugge',
          }
        : null,
    }

    const stops = [stop]
    if (overrides?.secondStop) {
      const nonce2 = generateDeliveryQrNonce()
      const stop2Id = 'stop-preview-2'
      const token2 = tokenService.sign({
        routeId: routeId.toHexString(),
        stopId: stop2Id,
        nonce: nonce2,
      })
      stops.push({
        ...stop,
        stopId: stop2Id,
        sequence: 2,
        pharmacyName: 'Apotheek Noord',
        qrConfirmation: {
          tokenVersion: DELIVERY_QR_TOKEN_VERSION,
          nonceHash: hashDeliveryQrNonce(nonce2),
          encodedToken: token2,
          issuedAt: new Date('2026-07-26T08:00:00.000Z'),
          consumedAt: null,
          consumedByUserId: null,
        },
        deliveryProof: null,
      })
    }

    return {
      _id: routeId,
      bezorgerProfileId: overrides?.bezorgerProfileId ?? courierProfileId.toHexString(),
      deliveryDate: '2026-07-26',
      status: overrides?.status ?? RouteStatus.IN_PROGRESS,
      stops,
    } as unknown as DeliveryRoute
  }

  function makeOrder(overrides?: {
    status?: OrderStatus
    apothekerId?: ObjectId
    missing?: boolean
  }) {
    if (overrides?.missing) {
      return null
    }

    return {
      _id: orderId,
      apothekerId: overrides?.apothekerId ?? pharmacyUserId,
      status: overrides?.status ?? OrderStatus.PLANNED,
      orderLines: [
        {
          vaccineId: new ObjectId().toHexString(),
          vaccineName: 'Influenza',
          manufacturer: 'Labs',
          quantity: 3,
        },
      ],
      totalQuantity: 3,
    }
  }

  function buildService(options?: {
    route?: DeliveryRoute | null
    order?: ReturnType<typeof makeOrder>
    profileId?: string | null
  }) {
    const route = options?.route === undefined ? makeRoute() : options.route
    const order = options?.order === undefined ? makeOrder() : options.order
    const routeRepo = {
      findOne: jest.fn().mockResolvedValue(route),
      save: jest.fn(),
    }
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(),
    }
    const profileService = {
      findByUserId: jest.fn().mockResolvedValue(
        options?.profileId === null
          ? null
          : {
              id: options?.profileId ?? courierProfileId.toHexString(),
              _id: courierProfileId,
            },
      ),
    }

    const service = new DeliveryQrPreviewService(
      routeRepo as never,
      orderRepo as never,
      profileService as never,
      tokenService,
    )

    return { service, routeRepo, orderRepo, profileService }
  }

  it('returns a safe preview for the assigned courier', async () => {
    const { service, routeRepo, orderRepo } = buildService()
    const result = await service.previewForCourier(courierUser(courierUserId), {
      token: encodedToken,
    })

    expect(result.routeId).toBe(routeId.toHexString())
    expect(result.stopId).toBe(stopId)
    expect(result.routeStatus).toBe(RouteStatus.IN_PROGRESS)
    expect(result.stopName).toBe('Apotheek Centrum')
    expect(result.pharmacy.city).toBe('Brugge')
    expect(result.orders).toHaveLength(1)
    expect(result.orders[0].lines[0]).toMatchObject({
      vaccineName: 'Influenza',
      quantity: 3,
    })
    expect(result.canConfirmDelivery).toBe(true)
    expect(JSON.stringify(result)).not.toContain('encodedToken')
    expect(JSON.stringify(result)).not.toContain('nonceHash')
    expect(JSON.stringify(result)).not.toContain(nonce)
    expect(routeRepo.save).not.toHaveBeenCalled()
    expect(orderRepo.save).not.toHaveBeenCalled()
  })

  it('rejects missing tokens', async () => {
    const { service } = buildService()
    await expect(
      service.previewForCourier(courierUser(), { token: '' }),
    ).rejects.toBeInstanceOf(DeliveryQrTokenRequiredException)
  })

  it('rejects oversized tokens', async () => {
    const { service } = buildService()
    await expect(
      service.previewForCourier(courierUser(), {
        token: 'a'.repeat(DELIVERY_QR_PREVIEW_TOKEN_MAX_LENGTH + 1),
      }),
    ).rejects.toBeInstanceOf(DeliveryQrPreviewTokenInvalidException)
  })

  it('rejects unrelated couriers', async () => {
    const { service } = buildService({
      profileId: new ObjectId().toHexString(),
    })
    await expect(
      service.previewForCourier(courierUser(), { token: encodedToken }),
    ).rejects.toBeInstanceOf(DeliveryQrPreviewForbiddenException)
  })

  it('rejects ASSIGNED routes', async () => {
    const { service } = buildService({
      route: makeRoute({ status: RouteStatus.ASSIGNED }),
    })
    await expect(
      service.previewForCourier(courierUser(courierUserId), {
        token: encodedToken,
      }),
    ).rejects.toBeInstanceOf(DeliveryQrRouteNotStartedException)
  })

  it('rejects COMPLETED and CANCELLED routes', async () => {
    for (const status of [RouteStatus.COMPLETED, RouteStatus.CANCELLED]) {
      const { service } = buildService({ route: makeRoute({ status }) })
      await expect(
        service.previewForCourier(courierUser(courierUserId), {
          token: encodedToken,
        }),
      ).rejects.toBeInstanceOf(DeliveryQrPreviewRouteInactiveException)
    }
  })

  it('rejects consumed QR', async () => {
    const { service } = buildService({
      route: makeRoute({ consumed: true }),
    })
    await expect(
      service.previewForCourier(courierUser(courierUserId), {
        token: encodedToken,
      }),
    ).rejects.toBeInstanceOf(DeliveryQrPreviewConsumedException)
  })

  it('rejects already-delivered stops', async () => {
    const { service } = buildService({
      route: makeRoute({ delivered: true }),
    })
    await expect(
      service.previewForCourier(courierUser(courierUserId), {
        token: encodedToken,
      }),
    ).rejects.toBeInstanceOf(DeliveryQrStopAlreadyDeliveredException)
  })

  it('fails the entire preview when an associated order is missing', async () => {
    const { service } = buildService({ order: null })
    await expect(
      service.previewForCourier(courierUser(courierUserId), {
        token: encodedToken,
      }),
    ).rejects.toBeInstanceOf(DeliveryQrOrderIntegrityException)
  })

  it('fails when order pharmacy does not match the stop', async () => {
    const { service } = buildService({
      order: makeOrder({ apothekerId: new ObjectId() }),
    })
    await expect(
      service.previewForCourier(courierUser(courierUserId), {
        token: encodedToken,
      }),
    ).rejects.toBeInstanceOf(DeliveryQrOrderIntegrityException)
  })

  it('fails when an associated order is cancelled', async () => {
    const { service } = buildService({
      order: makeOrder({ status: OrderStatus.CANCELLED }),
    })
    await expect(
      service.previewForCourier(courierUser(courierUserId), {
        token: encodedToken,
      }),
    ).rejects.toBeInstanceOf(DeliveryQrOrderIntegrityException)
  })

  it('fails when an associated order is already delivered', async () => {
    const { service } = buildService({
      order: makeOrder({ status: OrderStatus.DELIVERED }),
    })
    await expect(
      service.previewForCourier(courierUser(courierUserId), {
        token: encodedToken,
      }),
    ).rejects.toBeInstanceOf(DeliveryQrOrderIntegrityException)
  })
})
