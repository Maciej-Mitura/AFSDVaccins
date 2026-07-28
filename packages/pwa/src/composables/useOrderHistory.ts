import { computed, reactive, ref } from 'vue'

import type { OrderStatus } from '@vaccin-delivery/types'

import {
  ORDER_HISTORY_QUERY,
  type OrderHistoryQuery,
} from '@/assets/graphql/order-history'
import {
  buildOrderHistoryInput,
  createDefaultOrderHistoryFilters,
  hasActiveOrderHistoryFilters,
  type OrderHistoryFilterForm,
  type OrderHistoryPeriod,
} from '@/composables/order-history-filters'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL from '@/composables/useGraphQL'

export type UseOrderHistoryOptions = {
  /** When false, apothekerId is never sent (APOTHEKER UI). */
  allowApothekerFilter: boolean
}

export type OrderHistoryRow =
  OrderHistoryQuery['orderHistory']['edges'][number]['node']

/**
 * Shared order-archive data layer for ADMIN and APOTHEKER History pages.
 * Cursor pagination appends pages; filters replace the list via load/refetch.
 */
export function useOrderHistory(options: UseOrderHistoryOptions) {
  const { apolloClient } = useGraphQL()

  const filters = reactive<OrderHistoryFilterForm>(
    createDefaultOrderHistoryFilters(),
  )

  const orders = ref<OrderHistoryRow[]>([])
  const totalCount = ref<number | null>(null)
  const endCursor = ref<string | null>(null)
  const hasNextPage = ref(false)

  const loading = ref(false)
  const loadingMore = ref(false)
  const errorMessage = ref<string | null>(null)

  let loadGeneration = 0

  const isEmpty = computed(
    () => !loading.value && !errorMessage.value && orders.value.length === 0,
  )

  const isFilteredEmpty = computed(
    () => isEmpty.value && hasActiveOrderHistoryFilters(filters),
  )

  const hasFilters = computed(() => hasActiveOrderHistoryFilters(filters))

  function buildInput(after?: string | null) {
    return buildOrderHistoryInput(filters, {
      allowApothekerFilter: options.allowApothekerFilter,
      after,
    })
  }

  function applyConnection(
    connection: OrderHistoryQuery['orderHistory'],
    mode: 'replace' | 'append',
  ) {
    const nodes = connection.edges.map(edge => edge.node)
    if (mode === 'replace') {
      orders.value = nodes
    } else {
      const seen = new Set(orders.value.map(order => order.id))
      const unique = nodes.filter(node => !seen.has(node.id))
      orders.value = [...orders.value, ...unique]
    }
    totalCount.value = connection.totalCount ?? null
    hasNextPage.value = connection.pageInfo.hasNextPage
    endCursor.value = connection.pageInfo.endCursor ?? null
  }

  async function load() {
    const generation = ++loadGeneration
    loading.value = true
    errorMessage.value = null
    endCursor.value = null
    hasNextPage.value = false

    try {
      const result = await apolloClient.query<OrderHistoryQuery>({
        query: ORDER_HISTORY_QUERY,
        variables: { input: buildInput() },
        fetchPolicy: 'network-only',
      })

      if (generation !== loadGeneration) {
        return
      }

      applyConnection(result.data.orderHistory, 'replace')
    } catch (error: unknown) {
      if (generation !== loadGeneration) {
        return
      }
      orders.value = []
      totalCount.value = null
      hasNextPage.value = false
      endCursor.value = null
      errorMessage.value = mapGraphQLError(error)
    } finally {
      if (generation === loadGeneration) {
        loading.value = false
      }
    }
  }

  async function loadMore() {
    if (
      loading.value ||
      loadingMore.value ||
      !hasNextPage.value ||
      !endCursor.value
    ) {
      return
    }

    const generation = loadGeneration
    loadingMore.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<OrderHistoryQuery>({
        query: ORDER_HISTORY_QUERY,
        variables: { input: buildInput(endCursor.value) },
        fetchPolicy: 'network-only',
      })

      if (generation !== loadGeneration) {
        return
      }

      applyConnection(result.data.orderHistory, 'append')
    } catch (error: unknown) {
      if (generation !== loadGeneration) {
        return
      }
      errorMessage.value = mapGraphQLError(error)
    } finally {
      if (generation === loadGeneration) {
        loadingMore.value = false
      }
    }
  }

  async function refetch() {
    await load()
  }

  async function applyFilters() {
    await load()
  }

  async function clearFilters() {
    Object.assign(filters, createDefaultOrderHistoryFilters())
    await load()
  }

  function setStatus(status: OrderStatus | undefined) {
    filters.status = status
  }

  function setPeriod(period: OrderHistoryPeriod) {
    filters.period = period
    if (period !== 'custom') {
      filters.deliveryDateFrom = ''
      filters.deliveryDateTo = ''
    }
  }

  return {
    filters,
    orders,
    totalCount,
    hasNextPage,
    endCursor,
    loading,
    loadingMore,
    errorMessage,
    isEmpty,
    isFilteredEmpty,
    hasFilters,
    allowApothekerFilter: options.allowApothekerFilter,
    load,
    loadMore,
    refetch,
    applyFilters,
    clearFilters,
    setStatus,
    setPeriod,
    buildInput,
  }
}
