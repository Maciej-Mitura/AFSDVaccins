import { UserRole } from '../user/user-role.enum'
import { NotificationType } from './notification-type.enum'

/** Bounded interpolation field names allowed in persisted notification data. */
export const NOTIFICATION_INTERPOLATION_KEYS = [
  'routeDate',
  'pharmacyName',
  'city',
  'orderReference',
  'orderCount',
  'stopCount',
] as const

export type NotificationInterpolationKey =
  (typeof NOTIFICATION_INTERPOLATION_KEYS)[number]

export type NotificationInterpolationData = Partial<
  Record<NotificationInterpolationKey, string | number>
>

export type NotificationTaxonomyEntry = {
  type: NotificationType
  recipientRole: UserRole
  titleKey: string
  bodyKey: string
  /** Optional static action path; dynamic resolvers may override at create time. */
  actionPath?: string
  allowedInterpolationKeys: readonly NotificationInterpolationKey[]
}

const PHASE_27A_TAXONOMY: readonly NotificationTaxonomyEntry[] = [
  {
    type: NotificationType.APOTHEKER_ROUTE_STARTED,
    recipientRole: UserRole.APOTHEKER,
    titleKey: 'notifications.apotheker.routeStarted.title',
    bodyKey: 'notifications.apotheker.routeStarted.body',
    actionPath: '/apotheker/orders',
    allowedInterpolationKeys: ['routeDate', 'city', 'pharmacyName'],
  },
  {
    type: NotificationType.APOTHEKER_NEXT_STOP,
    recipientRole: UserRole.APOTHEKER,
    titleKey: 'notifications.apotheker.nextStop.title',
    bodyKey: 'notifications.apotheker.nextStop.body',
    actionPath: '/apotheker/orders',
    allowedInterpolationKeys: ['pharmacyName', 'city', 'routeDate'],
  },
  {
    type: NotificationType.APOTHEKER_DELIVERY_CONFIRMED,
    recipientRole: UserRole.APOTHEKER,
    titleKey: 'notifications.apotheker.deliveryConfirmed.title',
    bodyKey: 'notifications.apotheker.deliveryConfirmed.body',
    actionPath: '/apotheker/orders',
    allowedInterpolationKeys: [
      'orderReference',
      'routeDate',
      'pharmacyName',
      'orderCount',
    ],
  },
  {
    type: NotificationType.BEZORGER_ROUTE_ASSIGNED,
    recipientRole: UserRole.BEZORGER,
    titleKey: 'notifications.bezorger.routeAssigned.title',
    bodyKey: 'notifications.bezorger.routeAssigned.body',
    actionPath: '/bezorger/today',
    allowedInterpolationKeys: ['routeDate', 'city', 'stopCount'],
  },
  {
    type: NotificationType.BEZORGER_ROUTE_DATE_REMINDER,
    recipientRole: UserRole.BEZORGER,
    titleKey: 'notifications.bezorger.routeDateReminder.title',
    bodyKey: 'notifications.bezorger.routeDateReminder.body',
    actionPath: '/bezorger/today',
    allowedInterpolationKeys: ['routeDate', 'city', 'stopCount'],
  },
  {
    type: NotificationType.ADMIN_NEW_ORDER,
    recipientRole: UserRole.ADMIN,
    titleKey: 'notifications.admin.newOrder.title',
    bodyKey: 'notifications.admin.newOrder.body',
    actionPath: '/admin/orders',
    allowedInterpolationKeys: [
      'orderReference',
      'orderCount',
      'pharmacyName',
      'routeDate',
    ],
  },
] as const

const TAXONOMY_BY_TYPE = new Map(
  PHASE_27A_TAXONOMY.map(entry => [entry.type, entry]),
)

/** Legacy order/stock types keep Dutch title/body persistence (pre–Phase 27A). */
export const LEGACY_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set(
  [
    NotificationType.ORDER_CONFIRMATION,
    NotificationType.WEEK_LIMIT_WARNING,
    NotificationType.ORDER_CANCELLED,
    NotificationType.ORDER_DELIVERED,
    NotificationType.LOW_STOCK_WARNING,
  ],
)

export function getNotificationTaxonomy(
  type: NotificationType,
): NotificationTaxonomyEntry | undefined {
  return TAXONOMY_BY_TYPE.get(type)
}

export function isPhase27ANotificationType(type: NotificationType): boolean {
  return TAXONOMY_BY_TYPE.has(type)
}

export function assertRecipientRoleCompatible(
  type: NotificationType,
  recipientRole: UserRole,
): void {
  const taxonomy = getNotificationTaxonomy(type)

  if (!taxonomy) {
    return
  }

  if (taxonomy.recipientRole !== recipientRole) {
    throw new Error(
      `Notification type ${type} requires role ${taxonomy.recipientRole}, got ${recipientRole}`,
    )
  }
}

export function resolveDefaultActionPath(
  type: NotificationType,
): string | undefined {
  return getNotificationTaxonomy(type)?.actionPath
}

export { PHASE_27A_TAXONOMY }
