/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { ApolloError } from '@apollo/client/core'
import { GraphQLError } from 'graphql'

import { extractDailyLimitExceededDetails } from '@/composables/daily-limit-error'

function dailyLimitError(originalError: Record<string, unknown>): ApolloError {
  return new ApolloError({
    graphQLErrors: [
      new GraphQLError('Het dagmaximum is overschreden.', {
        extensions: {
          code: 'BAD_REQUEST',
          originalError,
        },
      }),
    ],
  })
}

describe('extractDailyLimitExceededDetails', () => {
  it('maps structured DAILY_LIMIT_EXCEEDED payload fields', () => {
    const details = extractDailyLimitExceededDetails(
      dailyLimitError({
        error: 'DAILY_LIMIT_EXCEEDED',
        vaccineId: 'flu-id',
        vaccineName: 'Influenza',
        dailyMaximum: 50,
        alreadyOrderedToday: 48,
        remainingToday: 2,
        requestedQuantity: 5,
      }),
    )

    expect(details).toEqual({
      vaccineId: 'flu-id',
      vaccineName: 'Influenza',
      dailyMaximum: 50,
      alreadyOrderedToday: 48,
      remainingToday: 2,
      requestedQuantity: 5,
    })
  })

  it('falls back to dailyLimit when dailyMaximum is absent', () => {
    const details = extractDailyLimitExceededDetails(
      dailyLimitError({
        error: 'DAILY_LIMIT_EXCEEDED',
        dailyLimit: 50,
        remainingToday: 0,
      }),
    )

    expect(details?.dailyMaximum).toBe(50)
    expect(details?.remainingToday).toBe(0)
  })

  it('returns null for unknown errors', () => {
    expect(extractDailyLimitExceededDetails(new Error('boom'))).toBeNull()
    expect(
      extractDailyLimitExceededDetails(
        dailyLimitError({ error: 'WEEKLY_LIMIT_EXCEEDED', weeklyLimit: 200 }),
      ),
    ).toBeNull()
  })
})
