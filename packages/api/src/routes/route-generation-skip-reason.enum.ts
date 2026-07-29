import { registerEnumType } from '@nestjs/graphql'

/**
 * Stable ADMIN-facing skip reason codes for route generation diagnostics.
 * Precedence when classifying (first match wins; an order appears in at most one group):
 * 1. PHARMACY_DATA_INCOMPLETE
 * 2. PHARMACY_NOT_IN_ACTIVE_TEMPLATE
 * 3. ORDER_ALREADY_ASSIGNED_ELSEWHERE
 * 4. ORDER_STATUS_NOT_ELIGIBLE
 * 5. NO_MATCHING_ORDER_FOR_DATE
 * 6. NO_ACTIVE_TEMPLATE / ROUTE_EXISTS_REGENERATION_REQUIRED / OTHER (context-level)
 */
export enum RouteGenerationSkipReasonCode {
  PHARMACY_NOT_IN_ACTIVE_TEMPLATE = 'PHARMACY_NOT_IN_ACTIVE_TEMPLATE',
  NO_MATCHING_ORDER_FOR_DATE = 'NO_MATCHING_ORDER_FOR_DATE',
  ORDER_STATUS_NOT_ELIGIBLE = 'ORDER_STATUS_NOT_ELIGIBLE',
  ORDER_ALREADY_ASSIGNED_ELSEWHERE = 'ORDER_ALREADY_ASSIGNED_ELSEWHERE',
  PHARMACY_DATA_INCOMPLETE = 'PHARMACY_DATA_INCOMPLETE',
  NO_ACTIVE_TEMPLATE = 'NO_ACTIVE_TEMPLATE',
  ROUTE_EXISTS_REGENERATION_REQUIRED = 'ROUTE_EXISTS_REGENERATION_REQUIRED',
  OTHER = 'OTHER',
}

registerEnumType(RouteGenerationSkipReasonCode, {
  name: 'RouteGenerationSkipReasonCode',
  description:
    'Stable reason codes explaining why orders or pharmacies were omitted from route generation',
})
