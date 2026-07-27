import type { CachedRouteSnapshot, CachedRouteStop } from '@/offline/types'

/**
 * Sensitive field names that must never appear in a cached route snapshot.
 * Checked recursively after whitelist serialisation as a safety net.
 */
export const FORBIDDEN_ROUTE_CACHE_FIELD_NAMES = [
  'encodedQrToken',
  'qrToken',
  'token',
  'nonce',
  'nonceHash',
  'qrSvg',
  'qrImage',
  'qrImageBlob',
  'qrImagePath',
  'authorization',
  'bearer',
  'idToken',
  'refreshToken',
  'accessToken',
  'firebaseToken',
  'endpoint',
  'p256dh',
  'pushAuth',
  'authSecret',
  'vapidPrivateKey',
  'azure',
  'sasUrl',
  'blobSas',
  'connectionString',
  // Phase 34A — voice reports must never enter IndexedDB route snapshots.
  'voiceReport',
  'voiceReports',
  'routeVoiceReport',
  'routeVoiceReports',
  'blobName',
  'audioBytes',
  'sha256',
] as const

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  return null
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function serializeStop(raw: unknown): CachedRouteStop | null {
  if (!isRecord(raw)) {
    return null
  }

  const addressRaw = isRecord(raw.address) ? raw.address : {}
  const linesRaw = Array.isArray(raw.lines) ? raw.lines : []
  const orderIdsRaw = Array.isArray(raw.orderIds) ? raw.orderIds : []

  return {
    stopId: asString(raw.stopId),
    sequence: asNumber(raw.sequence),
    pharmacyName: asString(raw.pharmacyName) ?? '',
    address: {
      street: asString(addressRaw.street) ?? '',
      houseNumber: asString(addressRaw.houseNumber) ?? '',
      postalCode: asString(addressRaw.postalCode) ?? '',
      city: asString(addressRaw.city) ?? '',
    },
    orderIds: orderIdsRaw
      .map(id => asString(id))
      .filter((id): id is string => id !== null),
    orderCount: asNumber(raw.orderCount),
    totalQuantity: asNumber(raw.totalQuantity),
    lines: linesRaw
      .map(line => {
        if (!isRecord(line)) {
          return null
        }
        const vaccineId = asString(line.vaccineId)
        const vaccineName = asString(line.vaccineName)
        if (!vaccineId || !vaccineName) {
          return null
        }
        return {
          vaccineId,
          vaccineName,
          quantity: asNumber(line.quantity),
        }
      })
      .filter((line): line is NonNullable<typeof line> => line !== null),
    qrAvailable: asBoolean(raw.qrAvailable),
    qrConsumed: asBoolean(raw.qrConsumed),
    deliveredAt: asString(raw.deliveredAt),
    arrival: serializeArrival(raw.arrival),
  }
}

function serializeArrival(raw: unknown): CachedRouteStop['arrival'] {
  if (!isRecord(raw)) {
    return null
  }
  const clientArrivedAt = asString(raw.clientArrivedAt)
  const recordedAt = asString(raw.recordedAt)
  const arrivedByUserId = asString(raw.arrivedByUserId)
  if (!clientArrivedAt || !recordedAt || !arrivedByUserId) {
    return null
  }
  return { clientArrivedAt, recordedAt, arrivedByUserId }
}

/**
 * Explicit whitelist serializer. Never persist arbitrary GraphQL response objects.
 *
 * Approved fields only — strips QR tokens, nonces, SVG, auth, push, Azure, and
 * unrelated admin/profile fields even if accidentally present on the input.
 */
export function serializeCourierRouteSnapshot(
  route: unknown,
): CachedRouteSnapshot | null {
  if (!isRecord(route)) {
    return null
  }

  const routeId = asString(route.id) ?? asString(route.routeId)
  const routeDate = asString(route.deliveryDate) ?? asString(route.routeDate)
  const routeStatus = asString(route.status) ?? asString(route.routeStatus)
  const assignedCourierProfileId =
    asString(route.bezorgerProfileId) ??
    asString(route.assignedCourierProfileId)

  if (!routeId || !routeDate || !routeStatus || !assignedCourierProfileId) {
    return null
  }

  const stopsRaw = Array.isArray(route.stops) ? route.stops : []
  const stops = stopsRaw
    .map(serializeStop)
    .filter((stop): stop is CachedRouteStop => stop !== null)

  const location = serializeLocationStatus(route.locationStatus)

  const snapshot: CachedRouteSnapshot = {
    routeId,
    routeDate,
    routeStatus,
    assignedCourierProfileId,
    stops,
    lastKnownCourierCity: location.city,
    lastKnownLocationRecordedAt: location.recordedAt,
    locationSource: location.source,
    nextStopSequence: location.nextStopSequence,
    nextStopPharmacyName: location.nextStopPharmacyName,
    nextStopCity: location.nextStopCity,
  }

  assertNoForbiddenRouteCacheFields(snapshot)
  return snapshot
}

function serializeLocationStatus(raw: unknown): {
  city: string | null
  recordedAt: string | null
  source: string | null
  nextStopSequence: number | null
  nextStopPharmacyName: string | null
  nextStopCity: string | null
} {
  const empty = {
    city: null,
    recordedAt: null,
    source: null,
    nextStopSequence: null,
    nextStopPharmacyName: null,
    nextStopCity: null,
  }

  if (!isRecord(raw)) {
    return empty
  }

  const nextStop = isRecord(raw.nextStop) ? raw.nextStop : null

  return {
    city: asString(raw.city),
    recordedAt: asString(raw.recordedAt),
    source: asString(raw.source),
    nextStopSequence:
      nextStop && typeof nextStop.sequence === 'number'
        ? nextStop.sequence
        : null,
    nextStopPharmacyName: nextStop ? asString(nextStop.pharmacyName) : null,
    nextStopCity: nextStop ? asString(nextStop.city) : null,
  }
}

/** Deep scan for forbidden property names (safety net after whitelist). */
export function assertNoForbiddenRouteCacheFields(value: unknown): void {
  const stack: unknown[] = [value]
  const seen = new Set<unknown>()

  while (stack.length > 0) {
    const current = stack.pop()
    if (!isRecord(current) && !Array.isArray(current)) {
      continue
    }
    if (seen.has(current)) {
      continue
    }
    seen.add(current)

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item)
      }
      continue
    }

    for (const [key, child] of Object.entries(current)) {
      const normalized = key.toLowerCase()
      for (const forbidden of FORBIDDEN_ROUTE_CACHE_FIELD_NAMES) {
        if (
          normalized === forbidden.toLowerCase() ||
          normalized.includes(forbidden.toLowerCase())
        ) {
          throw new Error(`FORBIDDEN_ROUTE_CACHE_FIELD:${key}`)
        }
      }
      stack.push(child)
    }
  }
}

/**
 * Returns true when a raw object still contains a forbidden field name
 * (used by tests against pre-serialisation inputs).
 */
export function containsForbiddenRouteCacheField(value: unknown): boolean {
  try {
    assertNoForbiddenRouteCacheFields(value)
    return false
  } catch {
    return true
  }
}
