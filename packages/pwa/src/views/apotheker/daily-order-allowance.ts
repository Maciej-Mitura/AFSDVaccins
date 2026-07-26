export type DailyVaccineAllowance = {
  vaccineId: string
  vaccineName: string
  dailyMaximum: number
  orderedToday: number
  remainingToday: number
}

export type OrderLineDraft = {
  vaccineId: string
  quantity: number
}

/**
 * Remaining allowance available for a new/additional quantity on a vaccine,
 * subtracting any quantity already present on the draft order line.
 */
export function remainingForAdd(
  allowance: DailyVaccineAllowance | undefined,
  draftQuantity: number,
): number {
  if (!allowance) {
    return 0
  }

  return Math.max(allowance.remainingToday - Math.max(draftQuantity, 0), 0)
}

export function isQuantityWithinAllowance(
  quantity: number,
  remaining: number,
): boolean {
  return (
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= remaining &&
    remaining > 0
  )
}

export function quantityExceedsAllowance(
  quantity: number,
  remaining: number,
): boolean {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) {
    return true
  }

  return quantity > remaining
}

export function findAllowance(
  allowances: readonly DailyVaccineAllowance[],
  vaccineId: string,
): DailyVaccineAllowance | undefined {
  return allowances.find(item => item.vaccineId === vaccineId)
}

/**
 * Validates draft lines against backend-provided remaining allowances.
 * Duplicate vaccineIds are summed (mirrors backend normalizeLines merge).
 */
export function validateDraftLinesAgainstAllowances(
  lines: readonly OrderLineDraft[],
  allowances: readonly DailyVaccineAllowance[],
): Map<string, 'exceeds' | 'none-remaining' | 'invalid'> {
  const errors = new Map<string, 'exceeds' | 'none-remaining' | 'invalid'>()
  const totals = new Map<string, number>()

  for (const line of lines) {
    totals.set(
      line.vaccineId,
      (totals.get(line.vaccineId) ?? 0) + line.quantity,
    )
  }

  for (const [vaccineId, quantity] of totals) {
    const allowance = findAllowance(allowances, vaccineId)
    const remaining = allowance?.remainingToday ?? 0

    if (!Number.isInteger(quantity) || quantity < 1) {
      errors.set(vaccineId, 'invalid')
      continue
    }

    if (remaining <= 0) {
      errors.set(vaccineId, 'none-remaining')
      continue
    }

    if (quantity > remaining) {
      errors.set(vaccineId, 'exceeds')
    }
  }

  return errors
}

export function hasInvalidDraftLines(
  lines: readonly OrderLineDraft[],
  allowances: readonly DailyVaccineAllowance[],
): boolean {
  return validateDraftLinesAgainstAllowances(lines, allowances).size > 0
}
