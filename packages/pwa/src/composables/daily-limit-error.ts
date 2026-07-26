import { ApolloError } from '@apollo/client/core'

export type DailyLimitExceededDetails = {
  vaccineId?: string
  vaccineName?: string
  dailyMaximum?: number
  alreadyOrderedToday?: number
  remainingToday?: number
  requestedQuantity?: number
}

type OriginalErrorPayload = {
  error?: string
  vaccineId?: string
  vaccineName?: string
  dailyMaximum?: number
  dailyLimit?: number
  alreadyOrderedToday?: number
  remainingToday?: number
  requestedQuantity?: number
}

function isOriginalErrorPayload(value: unknown): value is OriginalErrorPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOriginalError(error: unknown): OriginalErrorPayload | null {
  if (!(error instanceof ApolloError)) {
    return null
  }

  const graphQLError = error.graphQLErrors[0]
  const originalError = graphQLError?.extensions?.originalError

  if (!isOriginalErrorPayload(originalError)) {
    return null
  }

  if (
    'message' in originalError &&
    isOriginalErrorPayload(originalError.message)
  ) {
    return originalError.message
  }

  return originalError
}

export function extractDailyLimitExceededDetails(
  error: unknown,
): DailyLimitExceededDetails | null {
  const original = readOriginalError(error)
  if (!original || original.error !== 'DAILY_LIMIT_EXCEEDED') {
    return null
  }

  const dailyMaximum =
    typeof original.dailyMaximum === 'number'
      ? original.dailyMaximum
      : typeof original.dailyLimit === 'number'
        ? original.dailyLimit
        : undefined

  return {
    vaccineId:
      typeof original.vaccineId === 'string' ? original.vaccineId : undefined,
    vaccineName:
      typeof original.vaccineName === 'string'
        ? original.vaccineName
        : undefined,
    dailyMaximum,
    alreadyOrderedToday:
      typeof original.alreadyOrderedToday === 'number'
        ? original.alreadyOrderedToday
        : undefined,
    remainingToday:
      typeof original.remainingToday === 'number'
        ? original.remainingToday
        : undefined,
    requestedQuantity:
      typeof original.requestedQuantity === 'number'
        ? original.requestedQuantity
        : undefined,
  }
}
