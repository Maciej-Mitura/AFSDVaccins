import { ObjectId } from 'mongodb'

import { UserRole } from '../../user/user-role.enum'
import { User } from '../../user/user.entity'
import { DeliveryRoute } from '../delivery-route.entity'
import { RouteStatus } from '../route-status.enum'
import { DELIVERY_QR_TOKEN_VERSION } from './delivery-qr.constants'
import {
  DeliveryQrForbiddenException,
  DeliveryQrNotFoundException,
  DeliveryQrRouteInactiveException,
} from './delivery-stop-qr.exceptions'
import { DeliveryStopQrRetrievalService } from './delivery-stop-qr-retrieval.service'

function adminUser(): User {
  return {
    _id: new ObjectId(),
    role: UserRole.ADMIN,
  } as unknown as User
}

function apothekerUser(id: ObjectId = new ObjectId()): User {
  return {
    _id: id,
    role: UserRole.APOTHEKER,
  } as unknown as User
}

function makeRoute(overrides?: {
  status?: RouteStatus
  stopId?: string
  apothekerUserId?: string
  encodedToken?: string | null
  omitQr?: boolean
}): DeliveryRoute {
  const stopId = overrides?.stopId ?? 'stop-abc'
  const apothekerUserId = overrides?.apothekerUserId ?? new ObjectId().toString()
  const route = {
    _id: new ObjectId(),
    deliveryDate: '2026-07-26',
    status: overrides?.status ?? RouteStatus.ASSIGNED,
    stops: [
      {
        stopId,
        sequence: 1,
        apothekerProfileId: new ObjectId().toString(),
        apothekerUserId,
        pharmacyName: 'Test Apotheek',
        address: {
          street: 'Kerkstraat',
          houseNumber: '1',
          postalCode: '8000',
          city: 'Brugge',
          country: 'BE',
        },
        orderIds: ['o1', 'o2'],
        orderCount: 2,
        totalQuantity: 5,
        lines: [],
        qrConfirmation: overrides?.omitQr
          ? undefined
          : {
              tokenVersion: DELIVERY_QR_TOKEN_VERSION,
              nonceHash: 'b'.repeat(64),
              encodedToken:
                overrides?.encodedToken === null
                  ? ''
                  : (overrides?.encodedToken ?? 'payload.signature'),
              issuedAt: new Date('2026-07-26T08:00:00.000Z'),
              consumedAt: null,
              consumedByUserId: null,
            },
      },
    ],
  } as unknown as DeliveryRoute

  return route
}

describe('DeliveryStopQrRetrievalService', () => {
  it('allows ADMIN and owning APOTHEKER; rejects others', async () => {
    const ownerId = new ObjectId()
    const route = makeRoute({ apothekerUserId: ownerId.toString() })
    const repo = {
      findOne: jest.fn().mockResolvedValue(route),
    }
    const service = new DeliveryStopQrRetrievalService(repo as never)

    await expect(
      service.resolveAuthorisedEncodedToken(
        adminUser(),
        route._id.toString(),
        'stop-abc',
      ),
    ).resolves.toMatchObject({ encodedToken: 'payload.signature' })

    await expect(
      service.resolveAuthorisedEncodedToken(
        apothekerUser(ownerId),
        route._id.toString(),
        'stop-abc',
      ),
    ).resolves.toMatchObject({ encodedToken: 'payload.signature' })

    await expect(
      service.resolveAuthorisedEncodedToken(
        apothekerUser(),
        route._id.toString(),
        'stop-abc',
      ),
    ).rejects.toBeInstanceOf(DeliveryQrForbiddenException)
  })

  it('returns safe metadata without bearer fields', async () => {
    const ownerId = new ObjectId()
    const route = makeRoute({ apothekerUserId: ownerId.toString() })
    const repo = {
      findOne: jest.fn().mockResolvedValue(route),
    }
    const service = new DeliveryStopQrRetrievalService(repo as never)

    const meta = await service.getSafeStopQrMetadata(
      apothekerUser(ownerId),
      route._id.toString(),
      'stop-abc',
    )

    expect(meta.orderCount).toBe(2)
    expect(meta.orderIds).toEqual(['o1', 'o2'])
    expect(meta.qrAvailable).toBe(true)
    expect(meta.qrImagePath).toContain('/delivery-routes/')
    expect(meta).not.toHaveProperty('encodedToken')
    expect(JSON.stringify(meta)).not.toContain('nonceHash')
  })

  it('throws not-found for missing route or stop', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
    }
    const service = new DeliveryStopQrRetrievalService(repo as never)

    await expect(
      service.resolveAuthorisedEncodedToken(
        adminUser(),
        new ObjectId().toString(),
        'stop-abc',
      ),
    ).rejects.toBeInstanceOf(DeliveryQrNotFoundException)

    const route = makeRoute()
    repo.findOne.mockResolvedValue(route)
    await expect(
      service.resolveAuthorisedEncodedToken(
        adminUser(),
        route._id.toString(),
        'other-stop',
      ),
    ).rejects.toBeInstanceOf(DeliveryQrNotFoundException)
  })

  it('rejects inactive routes before returning a token', async () => {
    const route = makeRoute({ status: RouteStatus.COMPLETED })
    const repo = {
      findOne: jest.fn().mockResolvedValue(route),
    }
    const service = new DeliveryStopQrRetrievalService(repo as never)

    await expect(
      service.resolveAuthorisedEncodedToken(
        adminUser(),
        route._id.toString(),
        'stop-abc',
      ),
    ).rejects.toBeInstanceOf(DeliveryQrRouteInactiveException)
  })
})
