import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { filterAdminOperationsFeedEvent } from './admin-operations-feed.filter'
import { AdminOperationsEventType } from './admin-operations-feed.type'

describe('filterAdminOperationsFeedEvent', () => {
  const admin: User = {
    _id: 'admin-id',
    id: 'admin-id',
    firebaseUid: 'firebase-admin',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: UserRole.ADMIN,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const apotheker: User = {
    ...admin,
    _id: 'apotheker-id',
    id: 'apotheker-id',
    role: UserRole.APOTHEKER,
  }

  const payload = {
    adminOperationsFeed: {
      eventType: AdminOperationsEventType.NEW_ORDER,
      occurredAt: new Date(),
      message: 'test',
    },
  }

  function contextFor(user: User | null) {
    return {
      req: {
        applicationUser: user ?? undefined,
      },
    }
  }

  it('allows ADMIN subscribers', () => {
    expect(
      filterAdminOperationsFeedEvent(payload, {}, contextFor(admin) as never),
    ).toBe(true)
  })

  it('rejects APOTHEKER subscribers', () => {
    expect(
      filterAdminOperationsFeedEvent(
        payload,
        {},
        contextFor(apotheker) as never,
      ),
    ).toBe(false)
  })

  it('rejects BEZORGER subscribers', () => {
    expect(
      filterAdminOperationsFeedEvent(
        payload,
        {},
        contextFor({ ...admin, role: UserRole.BEZORGER, id: admin.id }) as never,
      ),
    ).toBe(false)
  })
})
