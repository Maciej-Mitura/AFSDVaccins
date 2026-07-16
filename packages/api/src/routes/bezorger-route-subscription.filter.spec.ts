import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { canReceiveBezorgerRouteUpdate } from './bezorger-route-subscription.filter'
import { DeliveryRoute } from './delivery-route.entity'
import { RouteStatus } from './route-status.enum'

describe('bezorger route subscription filter', () => {
  const route: DeliveryRoute = {
    _id: '807f1f77bcf86cd799439099',
    id: '807f1f77bcf86cd799439099',
    routeTemplateId: '607f1f77bcf86cd799439001',
    bezorgerProfileId: '607f1f77bcf86cd799439002',
    deliveryDate: '2026-07-16',
    status: RouteStatus.ASSIGNED,
    stops: [],
    skippedApothekerProfileIds: [],
    statusHistory: [],
    generatedAt: new Date(),
    generatedByUserId: '507f1f77bcf86cd799439012',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const bezorger: User = {
    _id: '507f1f77bcf86cd799439050',
    id: '507f1f77bcf86cd799439050',
    firebaseUid: 'firebase-bezorger',
    email: 'bezorger@example.com',
    firstName: 'Bezorger',
    lastName: 'One',
    role: UserRole.BEZORGER,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('allows the assigned courier', () => {
    expect(
      canReceiveBezorgerRouteUpdate(
        bezorger,
        route,
        '607f1f77bcf86cd799439002',
      ),
    ).toBe(true)
  })

  it('rejects another courier profile', () => {
    expect(
      canReceiveBezorgerRouteUpdate(
        bezorger,
        route,
        '607f1f77bcf86cd799439099',
      ),
    ).toBe(false)
  })

  it('rejects ADMIN and APOTHEKER', () => {
    const admin: User = {
      ...bezorger,
      id: bezorger.id,
      role: UserRole.ADMIN,
    }
    const apotheker: User = {
      ...bezorger,
      id: bezorger.id,
      role: UserRole.APOTHEKER,
    }

    expect(
      canReceiveBezorgerRouteUpdate(
        admin,
        route,
        '607f1f77bcf86cd799439002',
      ),
    ).toBe(false)

    expect(
      canReceiveBezorgerRouteUpdate(
        apotheker,
        route,
        '607f1f77bcf86cd799439002',
      ),
    ).toBe(false)
  })

  it('rejects missing profile id', () => {
    expect(canReceiveBezorgerRouteUpdate(bezorger, route, null)).toBe(false)
  })
})
