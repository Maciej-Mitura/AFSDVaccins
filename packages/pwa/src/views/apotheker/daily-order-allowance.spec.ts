/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'

import {
  findAllowance,
  hasInvalidDraftLines,
  isQuantityWithinAllowance,
  quantityExceedsAllowance,
  remainingForAdd,
  validateDraftLinesAgainstAllowances,
  type DailyVaccineAllowance,
} from '@/views/apotheker/daily-order-allowance'

const flu: DailyVaccineAllowance = {
  vaccineId: 'flu',
  vaccineName: 'Influenza',
  dailyMaximum: 50,
  orderedToday: 40,
  remainingToday: 10,
}

const tetanus: DailyVaccineAllowance = {
  vaccineId: 'tetanus',
  vaccineName: 'Tetanus',
  dailyMaximum: 50,
  orderedToday: 50,
  remainingToday: 0,
}

describe('daily-order-allowance', () => {
  it('finds allowance by vaccine id', () => {
    expect(findAllowance([flu, tetanus], 'flu')).toEqual(flu)
    expect(findAllowance([flu], 'missing')).toBeUndefined()
  })

  it('computes remaining for add after draft quantity', () => {
    expect(remainingForAdd(flu, 0)).toBe(10)
    expect(remainingForAdd(flu, 4)).toBe(6)
    expect(remainingForAdd(flu, 10)).toBe(0)
    expect(remainingForAdd(flu, 12)).toBe(0)
    expect(remainingForAdd(undefined, 1)).toBe(0)
  })

  it('accepts exact-limit quantity and rejects over-limit', () => {
    expect(isQuantityWithinAllowance(10, 10)).toBe(true)
    expect(isQuantityWithinAllowance(1, 10)).toBe(true)
    expect(quantityExceedsAllowance(11, 10)).toBe(true)
    expect(quantityExceedsAllowance(10, 10)).toBe(false)
    expect(isQuantityWithinAllowance(1, 0)).toBe(false)
  })

  it('prevents duplicate lines from bypassing the combined daily limit', () => {
    const errors = validateDraftLinesAgainstAllowances(
      [
        { vaccineId: 'flu', quantity: 6 },
        { vaccineId: 'flu', quantity: 5 },
      ],
      [flu],
    )

    expect(errors.get('flu')).toBe('exceeds')
    expect(
      hasInvalidDraftLines([{ vaccineId: 'flu', quantity: 10 }], [flu]),
    ).toBe(false)
    expect(
      hasInvalidDraftLines([{ vaccineId: 'flu', quantity: 11 }], [flu]),
    ).toBe(true)
  })

  it('marks zero-remaining vaccines as none-remaining', () => {
    const errors = validateDraftLinesAgainstAllowances(
      [{ vaccineId: 'tetanus', quantity: 1 }],
      [tetanus],
    )
    expect(errors.get('tetanus')).toBe('none-remaining')
  })
})
