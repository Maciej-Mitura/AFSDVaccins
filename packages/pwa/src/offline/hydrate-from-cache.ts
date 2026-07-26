import { RouteStatus, type NotificationType } from '@vaccin-delivery/types'

import type { MyTodayRouteQuery } from '@/assets/graphql/routes'
import type { MyNotificationsQuery } from '@/assets/graphql/notification'
import type {
  CourierRouteCacheRecord,
  NotificationCacheRecord,
} from '@/offline/types'

export type HydratedTodayRoute = NonNullable<MyTodayRouteQuery['myTodayRoute']>
export type HydratedNotification =
  MyNotificationsQuery['myNotifications'][number]

function parseCachedRouteStatus(value: string): RouteStatus {
  if (value === 'ASSIGNED') {
    return RouteStatus.Assigned
  }
  if (value === 'IN_PROGRESS') {
    return RouteStatus.InProgress
  }
  if (value === 'COMPLETED') {
    return RouteStatus.Completed
  }
  if (value === 'CANCELLED') {
    return RouteStatus.Cancelled
  }
  return RouteStatus.Assigned
}

/**
 * Hydrate a whitelisted IndexedDB route snapshot into the courier route UI shape.
 * Fields intentionally omitted from the Phase 28A whitelist use safe defaults —
 * never invent GraphQL data that was not cached.
 */
export function hydrateDeliveryRouteFromCache(
  record: CourierRouteCacheRecord,
): HydratedTodayRoute {
  const snapshot = record.routeSnapshot

  return {
    id: snapshot.routeId,
    routeTemplateId: '',
    bezorgerProfileId: snapshot.assignedCourierProfileId,
    deliveryDate: snapshot.routeDate,
    status: parseCachedRouteStatus(snapshot.routeStatus),
    skippedApothekerProfileIds: [],
    generatedAt: record.fetchedAt,
    generatedByUserId: '',
    createdAt: record.fetchedAt,
    updatedAt: record.serverUpdatedAt ?? record.fetchedAt,
    statusHistory: [],
    stops: snapshot.stops.map(stop => ({
      stopId: stop.stopId,
      sequence: stop.sequence,
      apothekerProfileId: '',
      apothekerUserId: '',
      pharmacyName: stop.pharmacyName,
      orderIds: [...stop.orderIds],
      orderCount: stop.orderCount,
      totalQuantity: stop.totalQuantity,
      qrAvailable: stop.qrAvailable,
      qrConsumed: stop.qrConsumed,
      deliveredAt: stop.deliveredAt,
      address: {
        street: stop.address.street,
        houseNumber: stop.address.houseNumber,
        postalCode: stop.address.postalCode,
        city: stop.address.city,
        country: '',
      },
      lines: stop.lines.map(line => ({
        vaccineId: line.vaccineId,
        vaccineName: line.vaccineName,
        manufacturer: '',
        quantity: line.quantity,
      })),
    })),
  }
}

/**
 * Hydrate cached notifications into the notification centre list shape.
 * Must never be used to trigger toasts.
 */
export function hydrateNotificationsFromCache(
  records: NotificationCacheRecord[],
): HydratedNotification[] {
  return records.map(record => ({
    id: record.notificationId,
    type: record.type as NotificationType,
    title: record.titleKey ?? '',
    body: record.bodyKey ?? '',
    titleKey: record.titleKey,
    bodyKey: record.bodyKey,
    interpolationData: record.interpolationData
      ? {
          routeDate: record.interpolationData.routeDate ?? null,
          pharmacyName: record.interpolationData.pharmacyName ?? null,
          city: record.interpolationData.city ?? null,
          orderReference: record.interpolationData.orderReference ?? null,
          orderCount: record.interpolationData.orderCount ?? null,
        }
      : null,
    read: Boolean(record.readAt),
    readAt: record.readAt,
    relatedOrderId: null,
    eventId: null,
    actionPath: record.actionPath,
    createdAt: record.createdAt,
  }))
}
