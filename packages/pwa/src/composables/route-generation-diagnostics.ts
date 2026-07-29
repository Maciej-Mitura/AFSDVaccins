/**
 * Maps stable route-generation skip reason codes to translation keys.
 * Never show raw codes in primary UI copy.
 */
export const ROUTE_SKIP_REASON_I18N_KEYS = {
  PHARMACY_NOT_IN_ACTIVE_TEMPLATE: 'routes.diagnostics.reason.notInTemplate',
  NO_MATCHING_ORDER_FOR_DATE: 'routes.diagnostics.reason.noMatchingOrder',
  ORDER_STATUS_NOT_ELIGIBLE: 'routes.diagnostics.reason.statusNotEligible',
  ORDER_ALREADY_ASSIGNED_ELSEWHERE: 'routes.diagnostics.reason.alreadyAssigned',
  PHARMACY_DATA_INCOMPLETE: 'routes.diagnostics.reason.incompletePharmacy',
  NO_ACTIVE_TEMPLATE: 'routes.diagnostics.reason.noActiveTemplate',
  ROUTE_EXISTS_REGENERATION_REQUIRED:
    'routes.diagnostics.reason.regenerationRequired',
  OTHER: 'routes.diagnostics.reason.other',
} as const

export type RouteSkipReasonCode = keyof typeof ROUTE_SKIP_REASON_I18N_KEYS

export function routeSkipReasonLabelKey(
  code: string,
): (typeof ROUTE_SKIP_REASON_I18N_KEYS)[RouteSkipReasonCode] {
  if (code in ROUTE_SKIP_REASON_I18N_KEYS) {
    return ROUTE_SKIP_REASON_I18N_KEYS[code as RouteSkipReasonCode]
  }
  return ROUTE_SKIP_REASON_I18N_KEYS.OTHER
}
