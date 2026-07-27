import type { Collection, Db, Document } from 'mongodb'
import { ObjectId } from 'mongodb'

import { SEED_ROUTE_TEMPLATE_NORMALIZED } from '../seed/seed.constants'

export const ROUTE_TEMPLATE_REPAIR_ACTOR_ID =
  'cli:repair:route-template-assignments'

export type RouteTemplateAssignmentRow = {
  id: string
  name: string
  normalizedName: string
  active: boolean
  bezorgerProfileId: string
  createdAt: string | null
  updatedAt: string | null
  stopCount: number
  isSeedNamed: boolean
}

export type CourierActiveAssignmentGroup = {
  bezorgerProfileId: string
  activeCount: number
  templates: RouteTemplateAssignmentRow[]
  recommendedKeepId: string | null
  recommendationReason: string | null
}

export type RouteTemplateAssignmentDiagnosis = {
  totalTemplates: number
  activeTemplates: number
  duplicateCourierCount: number
  duplicateGroups: CourierActiveAssignmentGroup[]
  healthyActiveCourierCount: number
}

export type RouteTemplateRepairPlan = {
  bezorgerProfileId: string
  keepTemplateId: string
  deactivateTemplateIds: string[]
  keepTemplate: RouteTemplateAssignmentRow | null
  dryRun: boolean
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  return null
}

function mapRow(doc: Document): RouteTemplateAssignmentRow {
  const normalizedName =
    typeof doc.normalizedName === 'string' ? doc.normalizedName : ''
  const seedNames = Object.values(SEED_ROUTE_TEMPLATE_NORMALIZED)

  return {
    id: String(doc._id),
    name: typeof doc.name === 'string' ? doc.name : '',
    normalizedName,
    active: doc.active === true,
    bezorgerProfileId: String(doc.bezorgerProfileId ?? ''),
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    stopCount: Array.isArray(doc.stops) ? doc.stops.length : 0,
    isSeedNamed: seedNames.includes(normalizedName),
  }
}

function recommendKeep(
  templates: RouteTemplateAssignmentRow[],
): Pick<
  CourierActiveAssignmentGroup,
  'recommendedKeepId' | 'recommendationReason'
> {
  const seedNamed = templates.filter(template => template.isSeedNamed)
  if (seedNamed.length === 1) {
    return {
      recommendedKeepId: seedNamed[0].id,
      recommendationReason:
        'Deterministic seed template name match (dev/demo recommendation only)',
    }
  }

  const byUpdated = [...templates].sort((a, b) => {
    const aTime = a.updatedAt ?? a.createdAt ?? ''
    const bTime = b.updatedAt ?? b.createdAt ?? ''
    return bTime.localeCompare(aTime)
  })

  if (byUpdated[0]) {
    return {
      recommendedKeepId: byUpdated[0].id,
      recommendationReason:
        'Most recently updated active template (suggestion only — confirm before --apply)',
    }
  }

  return { recommendedKeepId: null, recommendationReason: null }
}

export async function diagnoseRouteTemplateAssignments(
  db: Db,
): Promise<RouteTemplateAssignmentDiagnosis> {
  const collection = db.collection('route_templates')
  const docs = await collection.find({}).toArray()
  const rows = docs.map(mapRow)
  const activeRows = rows.filter(row => row.active)

  const byCourier = new Map<string, RouteTemplateAssignmentRow[]>()
  for (const row of activeRows) {
    const list = byCourier.get(row.bezorgerProfileId) ?? []
    list.push(row)
    byCourier.set(row.bezorgerProfileId, list)
  }

  const duplicateGroups: CourierActiveAssignmentGroup[] = []
  let healthyActiveCourierCount = 0

  for (const [bezorgerProfileId, templates] of byCourier) {
    if (templates.length === 1) {
      healthyActiveCourierCount += 1
      continue
    }

    if (templates.length > 1) {
      const recommendation = recommendKeep(templates)
      duplicateGroups.push({
        bezorgerProfileId,
        activeCount: templates.length,
        templates: [...templates].sort((a, b) => a.name.localeCompare(b.name)),
        ...recommendation,
      })
    }
  }

  duplicateGroups.sort((a, b) =>
    a.bezorgerProfileId.localeCompare(b.bezorgerProfileId),
  )

  return {
    totalTemplates: rows.length,
    activeTemplates: activeRows.length,
    duplicateCourierCount: duplicateGroups.length,
    duplicateGroups,
    healthyActiveCourierCount,
  }
}

export function formatDiagnosisReport(
  diagnosis: RouteTemplateAssignmentDiagnosis,
): string[] {
  const lines: string[] = [
    'Route template assignment diagnosis (read-only)',
    `Total templates: ${diagnosis.totalTemplates}`,
    `Active templates: ${diagnosis.activeTemplates}`,
    `Couriers with exactly one active template: ${diagnosis.healthyActiveCourierCount}`,
    `Couriers with multiple active templates: ${diagnosis.duplicateCourierCount}`,
  ]

  if (diagnosis.duplicateGroups.length === 0) {
    lines.push('No duplicate active assignments found.')
    return lines
  }

  for (const group of diagnosis.duplicateGroups) {
    lines.push('')
    lines.push(`Courier profile: ${group.bezorgerProfileId}`)
    lines.push(`Active templates: ${group.activeCount}`)
    for (const template of group.templates) {
      lines.push(
        `  - id=${template.id} name=${JSON.stringify(template.name)} stops=${template.stopCount} createdAt=${template.createdAt ?? 'n/a'} updatedAt=${template.updatedAt ?? 'n/a'} seedNamed=${template.isSeedNamed}`,
      )
    }
    if (group.recommendedKeepId) {
      lines.push(
        `  Suggested keep (not applied): ${group.recommendedKeepId} — ${group.recommendationReason}`,
      )
      lines.push(
        `  Repair dry-run: npm run repair:route-template-assignments -- --courier ${group.bezorgerProfileId} --keep ${group.recommendedKeepId}`,
      )
      lines.push(
        `  Repair apply:   npm run repair:route-template-assignments -- --courier ${group.bezorgerProfileId} --keep ${group.recommendedKeepId} --apply`,
      )
    }
  }

  return lines
}

export function buildRepairPlan(params: {
  diagnosis: RouteTemplateAssignmentDiagnosis
  bezorgerProfileId: string
  keepTemplateId: string
  dryRun: boolean
}): RouteTemplateRepairPlan {
  const group = params.diagnosis.duplicateGroups.find(
    item => item.bezorgerProfileId === params.bezorgerProfileId,
  )

  if (!group) {
    throw new Error(
      `No duplicate active templates found for courier ${params.bezorgerProfileId}`,
    )
  }

  const keepTemplate =
    group.templates.find(template => template.id === params.keepTemplateId) ??
    null

  if (!keepTemplate) {
    throw new Error(
      `Keep template ${params.keepTemplateId} is not an active template for courier ${params.bezorgerProfileId}`,
    )
  }

  return {
    bezorgerProfileId: params.bezorgerProfileId,
    keepTemplateId: params.keepTemplateId,
    deactivateTemplateIds: group.templates
      .filter(template => template.id !== params.keepTemplateId)
      .map(template => template.id),
    keepTemplate,
    dryRun: params.dryRun,
  }
}

export function formatRepairPlan(plan: RouteTemplateRepairPlan): string[] {
  const mode = plan.dryRun ? 'DRY-RUN (no mutations)' : 'APPLY'
  return [
    `Route template assignment repair (${mode})`,
    `Courier profile: ${plan.bezorgerProfileId}`,
    `Keep active: ${plan.keepTemplateId} (${plan.keepTemplate?.name ?? 'unknown'})`,
    `Deactivate (never delete): ${plan.deactivateTemplateIds.join(', ') || '(none)'}`,
  ]
}

export async function applyRepairPlan(
  db: Db,
  plan: RouteTemplateRepairPlan,
): Promise<{ deactivatedCount: number }> {
  if (plan.dryRun) {
    return { deactivatedCount: 0 }
  }

  if (plan.deactivateTemplateIds.length === 0) {
    return { deactivatedCount: 0 }
  }

  const collection: Collection<Document> = db.collection('route_templates')
  const objectIds = plan.deactivateTemplateIds.map(id => new ObjectId(id))

  const result = await collection.updateMany(
    {
      _id: { $in: objectIds },
      bezorgerProfileId: plan.bezorgerProfileId,
      active: true,
    },
    {
      $set: {
        active: false,
        updatedAt: new Date(),
        updatedByUserId: ROUTE_TEMPLATE_REPAIR_ACTOR_ID,
      },
    },
  )

  return { deactivatedCount: result.modifiedCount }
}
