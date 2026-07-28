import { ObjectId } from 'mongodb'

/** Stable hex namespace for Phase 35C analytics demo ObjectIds (24 hex chars). */
export const ANALYTICS_DEMO_OBJECT_ID_PREFIX = 'a35c00'

export const ANALYTICS_DEMO_COURIER_COUNT = 10

export const ANALYTICS_DEMO_EMAIL_DOMAIN = 'demo.be'

export const ANALYTICS_DEMO_EMAIL_PATTERN =
  /^courier-stat-(\d{2})@demo\.be$/i

export const ANALYTICS_DEMO_DISPLAY_NAME_PATTERN = /^Courier Stat (\d{2})$/

export const ANALYTICS_DEMO_TEMPLATE_NAME_PATTERN =
  /^Analytics Demo Route Stat (\d{2})$/

export const ANALYTICS_DEMO_TEMPLATE_NAME_PREFIX = 'Analytics Demo Route Stat'

export const ANALYTICS_DEMO_FIREBASE_UID_PREFIX = 'demo-analytics-stat-'

/** Synthetic admin actor stamped on generated routes (not a login account). */
export const ANALYTICS_DEMO_GENERATED_BY_USER_ID = `${ANALYTICS_DEMO_OBJECT_ID_PREFIX}ff00000000000001`

/**
 * Presentation / seed accounts that must never be mutated by this script.
 * Personal admin email is resolved from env at runtime when present.
 */
export const ANALYTICS_DEMO_PROTECTED_EMAILS = [
  'bezorger1@demo.be',
  'bezorger2@demo.be',
  'apotheker1@demo.be',
  'apotheker2@demo.be',
  'apotheker3@demo.be',
  'docent@howest.be',
] as const

export type AnalyticsDemoEntityKind =
  | 'user'
  | 'profile'
  | 'template'
  | 'route'
  | 'order'
  | 'stop'

const KIND_CODE: Record<AnalyticsDemoEntityKind, number> = {
  user: 0,
  profile: 1,
  template: 2,
  route: 3,
  order: 4,
  stop: 5,
}

export function analyticsDemoObjectId(
  kind: AnalyticsDemoEntityKind,
  index: number,
): ObjectId {
  if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) {
    throw new Error(`Invalid analytics demo ObjectId index: ${index}`)
  }
  const hex = `${ANALYTICS_DEMO_OBJECT_ID_PREFIX}${KIND_CODE[kind]
    .toString(16)
    .padStart(2, '0')}${index.toString(16).padStart(16, '0')}`
  return new ObjectId(hex)
}

export function analyticsDemoCourierIndex(oneBased: number): number {
  if (oneBased < 1 || oneBased > ANALYTICS_DEMO_COURIER_COUNT) {
    throw new Error(`Courier index out of range: ${oneBased}`)
  }
  return oneBased - 1
}

export function analyticsDemoEmail(oneBased: number): string {
  return `courier-stat-${String(oneBased).padStart(2, '0')}@${ANALYTICS_DEMO_EMAIL_DOMAIN}`
}

export function analyticsDemoDisplayName(oneBased: number): string {
  return `Courier Stat ${String(oneBased).padStart(2, '0')}`
}

export function analyticsDemoTemplateName(oneBased: number): string {
  return `${ANALYTICS_DEMO_TEMPLATE_NAME_PREFIX} ${String(oneBased).padStart(2, '0')}`
}

export function analyticsDemoFirebaseUid(oneBased: number): string {
  return `${ANALYTICS_DEMO_FIREBASE_UID_PREFIX}${String(oneBased).padStart(2, '0')}`
}

export function analyticsDemoVehicleLabel(oneBased: number): string {
  return `Stat-Van-${String(oneBased).padStart(2, '0')}`
}

export function isAnalyticsDemoEmail(email: string): boolean {
  return ANALYTICS_DEMO_EMAIL_PATTERN.test(email.trim())
}

export function isProtectedPresentationEmail(
  email: string,
  extraProtected: readonly string[] = [],
): boolean {
  const normalised = email.trim().toLowerCase()
  if (
    ANALYTICS_DEMO_PROTECTED_EMAILS.some(e => e.toLowerCase() === normalised)
  ) {
    return true
  }
  return extraProtected.some(e => e.trim().toLowerCase() === normalised)
}
