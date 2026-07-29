import { ApothekerProfile } from '../profile/apotheker/apotheker-profile.entity'
import {
  RouteGenerationDiagnostics,
  RouteGenerationSkipGroup,
} from './route-generation-diagnostics.type'
import { RouteGenerationSkipReasonCode } from './route-generation-skip-reason.enum'

export type SkipGroupDraft = {
  code: RouteGenerationSkipReasonCode
  apothekerProfileIds: string[]
  orderIds: string[]
  pharmacyNames: string[]
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Profile fields required to build a safe stop snapshot. Incomplete profiles are
 * reported diagnostically; generation still uses existing inclusion rules for
 * pharmacies that have qualifying orders.
 */
export function isPharmacyProfileComplete(
  profile: Pick<ApothekerProfile, 'pharmacyName' | 'address'>,
): boolean {
  if (!hasText(profile.pharmacyName)) {
    return false
  }

  const address = profile.address
  if (!address) {
    return false
  }

  return (
    hasText(address.street) &&
    hasText(address.houseNumber) &&
    hasText(address.postalCode) &&
    hasText(address.city) &&
    hasText(address.country)
  )
}

export class RouteGenerationDiagnosticsCollector {
  private readonly groups = new Map<
    RouteGenerationSkipReasonCode,
    SkipGroupDraft
  >()
  private readonly seenOrderIds = new Set<string>()
  private readonly seenPharmacyIds = new Set<string>()

  addSkip(input: {
    code: RouteGenerationSkipReasonCode
    apothekerProfileId?: string | null
    pharmacyName?: string | null
    orderIds?: string[]
  }): void {
    const orderIds = (input.orderIds ?? [])
      .map(id => id.toString())
      .filter(id => id.length > 0 && !this.seenOrderIds.has(id))

    for (const id of orderIds) {
      this.seenOrderIds.add(id)
    }

    const profileId = input.apothekerProfileId?.toString() ?? null
    const pharmacyName = hasText(input.pharmacyName)
      ? input.pharmacyName.trim()
      : null

    let group = this.groups.get(input.code)
    if (!group) {
      group = {
        code: input.code,
        apothekerProfileIds: [],
        orderIds: [],
        pharmacyNames: [],
      }
      this.groups.set(input.code, group)
    }

    if (profileId && !group.apothekerProfileIds.includes(profileId)) {
      group.apothekerProfileIds.push(profileId)
      this.seenPharmacyIds.add(profileId)
    }

    for (const orderId of orderIds) {
      if (!group.orderIds.includes(orderId)) {
        group.orderIds.push(orderId)
      }
    }

    if (pharmacyName && !group.pharmacyNames.includes(pharmacyName)) {
      group.pharmacyNames.push(pharmacyName)
    }
  }

  build(input: {
    includedOrderCount: number
    includedStopCount: number
    regenerated: boolean
    regenerationNeeded: boolean
  }): RouteGenerationDiagnostics {
    const skipGroups: RouteGenerationSkipGroup[] = [
      RouteGenerationSkipReasonCode.PHARMACY_DATA_INCOMPLETE,
      RouteGenerationSkipReasonCode.PHARMACY_NOT_IN_ACTIVE_TEMPLATE,
      RouteGenerationSkipReasonCode.ORDER_ALREADY_ASSIGNED_ELSEWHERE,
      RouteGenerationSkipReasonCode.ORDER_STATUS_NOT_ELIGIBLE,
      RouteGenerationSkipReasonCode.NO_MATCHING_ORDER_FOR_DATE,
      RouteGenerationSkipReasonCode.NO_ACTIVE_TEMPLATE,
      RouteGenerationSkipReasonCode.ROUTE_EXISTS_REGENERATION_REQUIRED,
      RouteGenerationSkipReasonCode.OTHER,
    ]
      .map(code => this.groups.get(code))
      .filter((group): group is SkipGroupDraft => group != null)
      .map(group => ({
        code: group.code,
        count: Math.max(group.orderIds.length, group.apothekerProfileIds.length),
        apothekerProfileIds: group.apothekerProfileIds,
        orderIds: group.orderIds,
        pharmacyNames: group.pharmacyNames,
      }))

    const skippedOrderCount = skipGroups.reduce(
      (sum, group) => sum + group.orderIds.length,
      0,
    )
    const skippedPharmacyCount = this.seenPharmacyIds.size

    return {
      includedOrderCount: input.includedOrderCount,
      includedStopCount: input.includedStopCount,
      skippedOrderCount,
      skippedPharmacyCount,
      regenerated: input.regenerated,
      regenerationNeeded: input.regenerationNeeded,
      skipGroups,
    }
  }
}
