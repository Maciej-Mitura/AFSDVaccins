import { buildNormalizedGraphqlRequest } from '../authentication/graphql-auth.context'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { OrderStatus } from './order-status.enum'
import { Order } from './order.entity'
import {
  canReceiveOrderEvent,
  filterOrderCreatedEvent,
  filterOrderUpdatedEvent,
} from './order-subscription.filter'

describe('order-subscription.filter', () => {
  const apothekerA: User = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    firebaseUid: 'firebase-a',
    email: 'a@example.com',
    firstName: 'A',
    lastName: 'Apotheker',
    role: UserRole.APOTHEKER,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const apothekerB: User = {
    ...apothekerA,
    _id: '507f1f77bcf86cd799439012',
    id: '507f1f77bcf86cd799439012',
    firebaseUid: 'firebase-b',
    email: 'b@example.com',
  }

  const admin: User = {
    ...apothekerA,
    _id: '507f1f77bcf86cd799439013',
    id: '507f1f77bcf86cd799439013',
    role: UserRole.ADMIN,
    email: 'admin@example.com',
  }

  const bezorger: User = {
    ...apothekerA,
    _id: '507f1f77bcf86cd799439014',
    id: '507f1f77bcf86cd799439014',
    role: UserRole.BEZORGER,
    email: 'bezorger@example.com',
  }

  const orderForA: Order = {
    _id: 'order-a',
    id: 'order-a',
    apothekerId: apothekerA._id,
    status: OrderStatus.PENDING,
    orderLines: [],
    totalQuantity: 1,
    isoWeek: 29,
    isoYear: 2026,
    submittedAt: new Date('2026-07-14T10:00:00.000Z'),
    deliveryDate: '2026-07-14',
    cancelledAt: null,
    createdAt: new Date('2026-07-14T10:00:00.000Z'),
    updatedAt: new Date('2026-07-14T10:00:00.000Z'),
  }

  function contextFor(user: User | null) {
    return {
      req: {
        applicationUser: user ?? undefined,
      },
    }
  }

  function wsContextFor(user: User) {
    const wsAuth = buildNormalizedGraphqlRequest({
      user: {
        uid: user.firebaseUid,
        email: user.email,
        emailVerified: true,
      },
      applicationUser: user,
      headers: {
        authorization: 'Bearer ws-token',
      },
    })

    return {
      req: {
        headers: wsAuth.headers,
        user: wsAuth.user,
        applicationUser: wsAuth.applicationUser,
      },
      extra: {
        socket: {},
        request: {},
        wsAuth,
      },
    }
  }

  it('allows ADMIN to receive all order events', () => {
    expect(canReceiveOrderEvent(admin, orderForA)).toBe(true)
  })

  it('allows APOTHEKER to receive own order events only', () => {
    expect(canReceiveOrderEvent(apothekerA, orderForA)).toBe(true)
    expect(canReceiveOrderEvent(apothekerB, orderForA)).toBe(false)
  })

  it('denies BEZORGER order events', () => {
    expect(canReceiveOrderEvent(bezorger, orderForA)).toBe(false)
  })

  it('filters orderCreated for APOTHEKER ownership', () => {
    expect(
      filterOrderCreatedEvent(
        { orderCreated: orderForA },
        {},
        contextFor(apothekerA),
      ),
    ).toBe(true)

    expect(
      filterOrderCreatedEvent(
        { orderCreated: orderForA },
        {},
        contextFor(apothekerB),
      ),
    ).toBe(false)
  })

  it('filters orderUpdated for ADMIN and APOTHEKER ownership', () => {
    expect(
      filterOrderUpdatedEvent(
        { orderUpdated: orderForA },
        {},
        contextFor(admin),
      ),
    ).toBe(true)

    expect(
      filterOrderUpdatedEvent(
        { orderUpdated: orderForA },
        {},
        contextFor(apothekerA),
      ),
    ).toBe(true)
  })

  it('filters orderUpdated using graphql-ws extra.wsAuth context', () => {
    expect(
      filterOrderUpdatedEvent(
        { orderUpdated: orderForA },
        {},
        wsContextFor(apothekerA),
      ),
    ).toBe(true)

    expect(
      filterOrderUpdatedEvent(
        { orderUpdated: orderForA },
        {},
        wsContextFor(apothekerB),
      ),
    ).toBe(false)
  })

  it('rejects events without authenticated application user', () => {
    expect(
      filterOrderCreatedEvent(
        { orderCreated: orderForA },
        {},
        contextFor(null),
      ),
    ).toBe(false)
  })
})
