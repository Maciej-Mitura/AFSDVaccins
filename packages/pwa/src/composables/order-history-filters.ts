import type { OrderHistoryInput, OrderStatus } from '@vaccin-delivery/types'

export const ORDER_HISTORY_PAGE_SIZE = 25

export type OrderHistoryPeriod = 'all' | '7d' | '30d' | '90d' | 'custom'

export type OrderHistoryFilterForm = {
  search: string
  status: OrderStatus | undefined
  period: OrderHistoryPeriod
  deliveryDateFrom: string
  deliveryDateTo: string
  /** ADMIN only — apotheker user id. Never sent for APOTHEKER. */
  apothekerId: string | undefined
}

export function createDefaultOrderHistoryFilters(): OrderHistoryFilterForm {
  return {
    search: '',
    status: undefined,
    period: 'all',
    deliveryDateFrom: '',
    deliveryDateTo: '',
    apothekerId: undefined,
  }
}

export function hasActiveOrderHistoryFilters(
  filters: OrderHistoryFilterForm,
): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.status !== undefined ||
    filters.period !== 'all' ||
    filters.deliveryDateFrom.length > 0 ||
    filters.deliveryDateTo.length > 0 ||
    Boolean(filters.apothekerId)
  )
}

/** Calendar YYYY-MM-DD in local timezone. */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  )
}

function endOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  )
}

function daysAgoLocal(now: Date, days: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setDate(d.getDate() - days)
  return d
}

/**
 * Build GraphQL input from UI filters.
 * Period presets use submittedAt bounds from the client clock.
 * Custom period uses planned deliveryDate from/to.
 */
export function buildOrderHistoryInput(
  filters: OrderHistoryFilterForm,
  options: {
    allowApothekerFilter: boolean
    after?: string | null
    first?: number
    now?: Date
  },
): OrderHistoryInput {
  const now = options.now ?? new Date()
  const input: OrderHistoryInput = {
    first: options.first ?? ORDER_HISTORY_PAGE_SIZE,
  }

  const search = filters.search.trim()
  if (search.length > 0) {
    input.search = search
  }

  if (filters.status) {
    input.status = filters.status
  }

  if (options.after) {
    input.after = options.after
  }

  if (options.allowApothekerFilter && filters.apothekerId) {
    input.apothekerId = filters.apothekerId
  }

  if (filters.period === 'custom') {
    if (filters.deliveryDateFrom) {
      input.deliveryDateFrom = filters.deliveryDateFrom
    }
    if (filters.deliveryDateTo) {
      input.deliveryDateTo = filters.deliveryDateTo
    }
    return input
  }

  if (filters.period === '7d') {
    input.submittedFrom = startOfLocalDay(daysAgoLocal(now, 7))
    input.submittedTo = endOfLocalDay(now)
  } else if (filters.period === '30d') {
    input.submittedFrom = startOfLocalDay(daysAgoLocal(now, 30))
    input.submittedTo = endOfLocalDay(now)
  } else if (filters.period === '90d') {
    input.submittedFrom = startOfLocalDay(daysAgoLocal(now, 90))
    input.submittedTo = endOfLocalDay(now)
  }

  return input
}

export function shortOrderId(id: string): string {
  if (id.length <= 8) {
    return id
  }
  return id.slice(-8)
}
