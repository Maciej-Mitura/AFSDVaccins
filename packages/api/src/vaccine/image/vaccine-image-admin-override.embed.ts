import { Column } from 'typeorm'

import { VaccineImageOverrideDecision } from './vaccine-image-override-decision.enum'

/**
 * Optional admin override of AI validation. Persistence only — not exposed on
 * the public GraphQL VaccineImage type in Phase 25B.
 */
export class VaccineImageAdminOverride {
  @Column()
  decision!: VaccineImageOverrideDecision

  @Column()
  reason!: string

  @Column()
  overriddenAt!: Date

  @Column()
  overriddenByUserId!: string
}
