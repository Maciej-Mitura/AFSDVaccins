import { ObjectId } from 'mongodb'

import { normalizeVaccineName } from '../vaccine/vaccine.utils'
import { normalizeRouteTemplateName } from '../route-templates/route-template.utils'

/** Deterministic order ObjectIds (architecture §14 scenarios). */
export const SEED_ORDER_IDS = {
  /** apotheker1 — today, near daily FLU limit (48) */
  apotheker1Today: 'a15eed000000000000000001',
  /** apotheker1 — tomorrow preview order */
  apotheker1Tomorrow: 'a15eed000000000000000002',
  /** apotheker2 — today chunk of weekly boundary */
  apotheker2Today: 'a15eed000000000000000003',
  /** apotheker2 — tomorrow chunk completing ~195 weekly doses */
  apotheker2Tomorrow: 'a15eed000000000000000004',
} as const

export function seedOrderObjectId(
  key: keyof typeof SEED_ORDER_IDS,
): ObjectId {
  return new ObjectId(SEED_ORDER_IDS[key])
}

export const SEED_VACCINES = [
  {
    name: 'Influenza',
    manufacturer: 'Seed Pharma',
    description: 'Seasonal influenza vaccine (demo catalogue)',
    stockWarningThreshold: 20,
    targetStock: 500,
    stockIdempotencyKey: 'seed:stock:influenza',
  },
  {
    name: 'COVID-19',
    manufacturer: 'Seed Pharma',
    description: 'COVID-19 vaccine (demo catalogue — low stock scenario)',
    stockWarningThreshold: 10,
    targetStock: 5,
    stockIdempotencyKey: 'seed:stock:covid-19',
  },
  {
    name: 'MMR',
    manufacturer: 'Seed Pharma',
    description: 'Measles-mumps-rubella vaccine (demo catalogue)',
    stockWarningThreshold: 15,
    targetStock: 200,
    stockIdempotencyKey: 'seed:stock:mmr',
  },
] as const

export const SEED_VACCINE_NORMALIZED_NAMES = SEED_VACCINES.map(vaccine =>
  normalizeVaccineName(vaccine.name),
)

export const SEED_ROUTE_TEMPLATE_BEZORGER1 = {
  name: 'Seed Demo Route Bezorger 1',
  description: 'West-Vlaanderen demo template (includes empty pharmacy stop)',
} as const

export const SEED_ROUTE_TEMPLATE_BEZORGER2 = {
  name: 'Seed Demo Route Bezorger 2',
  description: 'Cross-authz isolation template for bezorger2',
} as const

export const SEED_ROUTE_TEMPLATE_NORMALIZED = {
  bezorger1: normalizeRouteTemplateName(SEED_ROUTE_TEMPLATE_BEZORGER1.name),
  bezorger2: normalizeRouteTemplateName(SEED_ROUTE_TEMPLATE_BEZORGER2.name),
} as const

export function redactUid(uid: string): string {
  if (uid.length <= 8) {
    return '********'
  }

  return `${uid.slice(0, 4)}…${uid.slice(-4)}`
}
