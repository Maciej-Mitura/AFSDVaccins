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
  'doseCount',
  'warningPercentage',
  'weeklyDoseCap',
  'vaccineName',
  'quantityRemaining',
  'stockThreshold',
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

const STRUCTURED_NOTIFICATION_TAXONOMY: readonly NotificationTaxonomyEntry[] = [
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
  {
    type: NotificationType.ORDER_CONFIRMATION,
    recipientRole: UserRole.APOTHEKER,
    titleKey: 'notifications.apotheker.orderConfirmation.title',
    bodyKey: 'notifications.apotheker.orderConfirmation.body',
    actionPath: '/apotheker/orders',
    allowedInterpolationKeys: ['routeDate', 'doseCount', 'orderReference'],
  },
  {
    type: NotificationType.WEEK_LIMIT_WARNING,
    recipientRole: UserRole.APOTHEKER,
    titleKey: 'notifications.apotheker.weekLimitWarning.title',
    bodyKey: 'notifications.apotheker.weekLimitWarning.body',
    actionPath: '/apotheker/orders',
    allowedInterpolationKeys: [
      'warningPercentage',
      'weeklyDoseCap',
      'orderReference',
    ],
  },
  {
    type: NotificationType.ORDER_CANCELLED,
    recipientRole: UserRole.APOTHEKER,
    titleKey: 'notifications.apotheker.orderCancelled.title',
    bodyKey: 'notifications.apotheker.orderCancelled.body',
    actionPath: '/apotheker/orders',
    allowedInterpolationKeys: ['routeDate', 'orderReference'],
  },
  {
    type: NotificationType.ORDER_DELIVERED,
    recipientRole: UserRole.APOTHEKER,
    titleKey: 'notifications.apotheker.orderDelivered.title',
    bodyKey: 'notifications.apotheker.orderDelivered.body',
    actionPath: '/apotheker/orders',
    allowedInterpolationKeys: ['routeDate', 'orderReference'],
  },
  {
    type: NotificationType.LOW_STOCK_WARNING,
    recipientRole: UserRole.ADMIN,
    titleKey: 'notifications.admin.lowStock.title',
    bodyKey: 'notifications.admin.lowStock.body',
    actionPath: '/admin/stock',
    allowedInterpolationKeys: [
      'vaccineName',
      'quantityRemaining',
      'stockThreshold',
    ],
  },
] as const

/** @deprecated Alias kept for Phase 27A test/call-site compatibility. */
const PHASE_27A_TAXONOMY = STRUCTURED_NOTIFICATION_TAXONOMY

const TAXONOMY_BY_TYPE = new Map(
  STRUCTURED_NOTIFICATION_TAXONOMY.map(entry => [entry.type, entry]),
)

/**
 * Types that still use the legacy createNotification(title/body) path
 * are empty — all emitters now use structured titleKey/bodyKey.
 */
export const LEGACY_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set(
  [],
)

export function getNotificationTaxonomy(
  type: NotificationType,
): NotificationTaxonomyEntry | undefined {
  return TAXONOMY_BY_TYPE.get(type)
}

export function isPhase27ANotificationType(type: NotificationType): boolean {
  return TAXONOMY_BY_TYPE.has(type)
}

export function isStructuredNotificationType(type: NotificationType): boolean {
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

export { PHASE_27A_TAXONOMY, STRUCTURED_NOTIFICATION_TAXONOMY }
