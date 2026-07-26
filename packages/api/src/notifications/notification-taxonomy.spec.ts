import {
  assertRecipientRoleCompatible,
  getNotificationTaxonomy,
  isPhase27ANotificationType,
  PHASE_27A_TAXONOMY,
} from './notification-taxonomy'
import { NotificationType } from './notification-type.enum'
import { UserRole } from '../user/user-role.enum'
import { sanitizeInterpolationData } from './notification-interpolation'

describe('notification taxonomy', () => {
  it('covers all six Phase 27A types with role + i18n keys', () => {
    expect(PHASE_27A_TAXONOMY).toHaveLength(6)

    for (const entry of PHASE_27A_TAXONOMY) {
      expect(isPhase27ANotificationType(entry.type)).toBe(true)
      expect(entry.titleKey.startsWith('notifications.')).toBe(true)
      expect(entry.bodyKey.startsWith('notifications.')).toBe(true)
      expect(getNotificationTaxonomy(entry.type)?.recipientRole).toBe(
        entry.recipientRole,
      )
    }
  })

  it('enforces recipient-role compatibility', () => {
    expect(() =>
      assertRecipientRoleCompatible(
        NotificationType.ADMIN_NEW_ORDER,
        UserRole.ADMIN,
      ),
    ).not.toThrow()

    expect(() =>
      assertRecipientRoleCompatible(
        NotificationType.ADMIN_NEW_ORDER,
        UserRole.BEZORGER,
      ),
    ).toThrow(/ADMIN/)
  })

  it('bounds interpolation data and rejects unknown keys', () => {
    expect(
      sanitizeInterpolationData(NotificationType.BEZORGER_ROUTE_ASSIGNED, {
        routeDate: '2026-07-26',
        city: 'Gent',
      }),
    ).toEqual({ routeDate: '2026-07-26', city: 'Gent' })

    expect(() =>
      sanitizeInterpolationData(NotificationType.BEZORGER_ROUTE_ASSIGNED, {
        orderReference: 'x',
      }),
    ).toThrow(/not allowed/)
  })
})
