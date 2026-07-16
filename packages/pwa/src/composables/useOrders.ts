import { computed, ref } from 'vue'
import { ApolloError } from '@apollo/client/core'

import {
  ADMIN_ORDER_CREATED_SUBSCRIPTION,
  ADMIN_ORDER_UPDATED_SUBSCRIPTION,
  ORDER_CREATED_SUBSCRIPTION,
  ORDER_UPDATED_SUBSCRIPTION,
  type AdminOrderCreatedSubscription,
  type AdminOrderUpdatedSubscription,
  type OrderCreatedSubscription,
  type OrderUpdatedSubscription,
} from '@/assets/graphql/order.subscription'
import {
  ADMIN_DAILY_ORDER_OVERVIEW_QUERY,
  ADMIN_ORDERS_QUERY,
  ADMIN_WEEKLY_STATISTICS_QUERY,
  CANCEL_ORDER_MUTATION,
  CANCEL_OWN_ORDER_MUTATION,
  CREATE_ORDER_MUTATION,
  MY_ORDERS_QUERY,
  MY_WEEKLY_ORDER_SUMMARY_QUERY,
  UPDATE_ORDER_STATUS_MUTATION,
  type AdminDailyOrderOverviewQuery,
  type AdminDailyOrderOverviewQueryVariables,
  type AdminOrdersQuery,
  type AdminOrdersQueryVariables,
  type AdminWeeklyStatisticsQuery,
  type CancelOrderMutation,
  type CancelOwnOrderMutation,
  type CreateOrderMutation,
  type CreateOrderMutationVariables,
  type MyOrdersQuery,
  type MyWeeklyOrderSummaryQuery,
  type UpdateOrderStatusMutation,
  type UpdateOrderStatusMutationVariables,
} from '@/assets/graphql/order'
import {
  applyCancelMutationFailure,
  applyStatusMutationFailure,
  clearCancelActionError as clearCancelActionErrorState,
  clearStatusActionError as clearStatusActionErrorState,
} from '@/composables/admin-order-mutation-state'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL from '@/composables/useGraphQL'

export type OrderListItem = MyOrdersQuery['myOrders'][number]
export type AdminOrderListItem = AdminOrdersQuery['adminOrders'][number]
export type AdminDailyOverview =
  AdminDailyOrderOverviewQuery['adminDailyOrderOverview']
export type AdminWeeklyStats =
  AdminWeeklyStatisticsQuery['adminWeeklyStatistics']
export type WeeklyOrderSummary = MyWeeklyOrderSummaryQuery['myWeeklyOrderSummary']

const myOrders = ref<OrderListItem[]>([])
const adminOrders = ref<AdminOrderListItem[]>([])
const dailyOverview = ref<AdminDailyOverview | null>(null)
const weeklyStatistics = ref<AdminWeeklyStats | null>(null)
const weeklySummary = ref<WeeklyOrderSummary | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const adminOrdersLoading = ref(false)
const adminOrdersError = ref<string | null>(null)
const adminOverviewLoading = ref(false)
const adminOverviewError = ref<string | null>(null)
const adminWeeklyStatsLoading = ref(false)
const adminWeeklyStatsError = ref<string | null>(null)
const statusActionLoading = ref(false)
const statusActionError = ref<string | null>(null)
const cancelActionLoading = ref(false)
const cancelActionError = ref<string | null>(null)

let myOrderSubscriptionCleanup: (() => void) | null = null
let adminOrderSubscriptionCleanup: (() => void) | null = null

function upsertMyOrder(order: OrderListItem): void {
  const existingIndex = myOrders.value.findIndex(item => item.id === order.id)

  if (existingIndex === -1) {
    myOrders.value = [order, ...myOrders.value]
    return
  }

  myOrders.value = myOrders.value.map(item =>
    item.id === order.id ? { ...item, ...order } : item,
  )
}

function upsertAdminOrder(order: AdminOrderListItem): void {
  const existingIndex = adminOrders.value.findIndex(item => item.id === order.id)

  if (existingIndex === -1) {
    adminOrders.value = [order, ...adminOrders.value]
    return
  }

  adminOrders.value = adminOrders.value.map(item =>
    item.id === order.id ? { ...item, ...order } : item,
  )
}

function orderMatchesAdminFilters(
  order: AdminOrderListItem,
  filters: AdminOrdersQueryVariables,
): boolean {
  if (filters.isoYear !== undefined && order.isoYear !== filters.isoYear) {
    return false
  }

  if (filters.isoWeek !== undefined && order.isoWeek !== filters.isoWeek) {
    return false
  }

  if (filters.status !== undefined && order.status !== filters.status) {
    return false
  }

  if (
    filters.apothekerId !== undefined &&
    order.apotheker.id !== filters.apothekerId
  ) {
    return false
  }

  return true
}

function extractGraphQLErrorCode(error: unknown): string | null {
  if (!(error instanceof ApolloError)) {
    return null
  }

  const graphQLError = error.graphQLErrors[0]
  const originalError = graphQLError?.extensions?.originalError as
    | { error?: string }
    | undefined

  return originalError?.error ?? null
}

export function useOrders() {
  const { apolloClient } = useGraphQL()

  const hasWeeklyWarning = computed(
    () => weeklySummary.value?.warningReached ?? false,
  )

  async function loadMyOrders(
    isoYear?: number,
    isoWeek?: number,
  ): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<MyOrdersQuery>({
        query: MY_ORDERS_QUERY,
        variables: { isoYear, isoWeek },
        fetchPolicy: 'network-only',
      })

      myOrders.value = result.data.myOrders
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function loadWeeklySummary(
    isoYear?: number,
    isoWeek?: number,
  ): Promise<WeeklyOrderSummary> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<MyWeeklyOrderSummaryQuery>({
        query: MY_WEEKLY_ORDER_SUMMARY_QUERY,
        variables: { isoYear, isoWeek },
        fetchPolicy: 'network-only',
      })

      weeklySummary.value = result.data.myWeeklyOrderSummary
      return result.data.myWeeklyOrderSummary
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function createOrder(
    input: CreateOrderMutationVariables['input'],
  ): Promise<OrderListItem> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.mutate<CreateOrderMutation>({
        mutation: CREATE_ORDER_MUTATION,
        variables: { input },
      })

      if (!result.data?.createOrder) {
        throw new Error('Kon de bestelling niet plaatsen.')
      }

      const created = result.data.createOrder
      myOrders.value = [created, ...myOrders.value]
      await loadWeeklySummary(created.isoYear, created.isoWeek)
      return created
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function cancelOwnOrder(id: string): Promise<OrderListItem> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.mutate<CancelOwnOrderMutation>({
        mutation: CANCEL_OWN_ORDER_MUTATION,
        variables: { id },
      })

      if (!result.data?.cancelOwnOrder) {
        throw new Error('Kon de bestelling niet annuleren.')
      }

      const cancelled = result.data.cancelOwnOrder
      myOrders.value = myOrders.value.map(order =>
        order.id === id ? { ...order, ...cancelled } : order,
      )

      const currentOrder = myOrders.value.find(order => order.id === id)
      if (currentOrder) {
        await loadWeeklySummary(currentOrder.isoYear, currentOrder.isoWeek)
      }

      return myOrders.value.find(order => order.id === id)!
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function loadAdminOrders(
    variables: AdminOrdersQueryVariables = {},
  ): Promise<void> {
    adminOrdersLoading.value = true
    adminOrdersError.value = null

    try {
      const result = await apolloClient.query<AdminOrdersQuery>({
        query: ADMIN_ORDERS_QUERY,
        variables,
        fetchPolicy: 'network-only',
      })

      adminOrders.value = result.data.adminOrders
    } catch (error: unknown) {
      adminOrdersError.value = mapGraphQLError(error)
      throw error
    } finally {
      adminOrdersLoading.value = false
    }
  }

  async function loadAdminDailyOverview(
    deliveryDate: string,
  ): Promise<AdminDailyOverview> {
    adminOverviewLoading.value = true
    adminOverviewError.value = null

    try {
      const result = await apolloClient.query<AdminDailyOrderOverviewQuery>({
        query: ADMIN_DAILY_ORDER_OVERVIEW_QUERY,
        variables: { deliveryDate } satisfies AdminDailyOrderOverviewQueryVariables,
        fetchPolicy: 'network-only',
      })

      dailyOverview.value = result.data.adminDailyOrderOverview
      return result.data.adminDailyOrderOverview
    } catch (error: unknown) {
      adminOverviewError.value = mapGraphQLError(error)
      throw error
    } finally {
      adminOverviewLoading.value = false
    }
  }

  async function loadAdminWeeklyStatistics(
    isoYear: number,
    isoWeek: number,
  ): Promise<AdminWeeklyStats> {
    adminWeeklyStatsLoading.value = true
    adminWeeklyStatsError.value = null

    try {
      const result = await apolloClient.query<AdminWeeklyStatisticsQuery>({
        query: ADMIN_WEEKLY_STATISTICS_QUERY,
        variables: { isoYear, isoWeek },
        fetchPolicy: 'network-only',
      })

      weeklyStatistics.value = result.data.adminWeeklyStatistics
      return result.data.adminWeeklyStatistics
    } catch (error: unknown) {
      adminWeeklyStatsError.value = mapGraphQLError(error)
      throw error
    } finally {
      adminWeeklyStatsLoading.value = false
    }
  }

  async function updateOrderStatus(
    id: string,
    status: UpdateOrderStatusMutationVariables['status'],
    reason?: string,
  ): Promise<AdminOrderListItem> {
    statusActionLoading.value = true
    statusActionError.value = null

    try {
      const result = await apolloClient.mutate<UpdateOrderStatusMutation>({
        mutation: UPDATE_ORDER_STATUS_MUTATION,
        variables: { id, status, reason },
      })

      if (!result.data?.updateOrderStatus) {
        throw new Error('Kon de bestellingsstatus niet bijwerken.')
      }

      const updated = result.data.updateOrderStatus as AdminOrderListItem
      upsertAdminOrder(updated)
      return updated
    } catch (error: unknown) {
      const next = applyStatusMutationFailure(
        {
          statusActionError: statusActionError.value,
          cancelActionError: cancelActionError.value,
          ordersError: adminOrdersError.value,
        },
        mapGraphQLError(error),
      )
      statusActionError.value = next.statusActionError
      throw error
    } finally {
      statusActionLoading.value = false
    }
  }

  async function cancelOrderAsAdmin(
    id: string,
    reason?: string,
  ): Promise<AdminOrderListItem> {
    cancelActionLoading.value = true
    cancelActionError.value = null

    try {
      const result = await apolloClient.mutate<CancelOrderMutation>({
        mutation: CANCEL_ORDER_MUTATION,
        variables: { id, reason },
      })

      if (!result.data?.cancelOrder) {
        throw new Error('Kon de bestelling niet annuleren.')
      }

      const cancelled = result.data.cancelOrder as AdminOrderListItem
      upsertAdminOrder(cancelled)
      return cancelled
    } catch (error: unknown) {
      const next = applyCancelMutationFailure(
        {
          statusActionError: statusActionError.value,
          cancelActionError: cancelActionError.value,
          ordersError: adminOrdersError.value,
        },
        mapGraphQLError(error),
      )
      cancelActionError.value = next.cancelActionError
      throw error
    } finally {
      cancelActionLoading.value = false
    }
  }

  function clearStatusActionError(): void {
    const next = clearStatusActionErrorState({
      statusActionError: statusActionError.value,
      cancelActionError: cancelActionError.value,
      ordersError: adminOrdersError.value,
    })
    statusActionError.value = next.statusActionError
  }

  function clearCancelActionError(): void {
    const next = clearCancelActionErrorState({
      statusActionError: statusActionError.value,
      cancelActionError: cancelActionError.value,
      ordersError: adminOrdersError.value,
    })
    cancelActionError.value = next.cancelActionError
  }

  function isInvalidOrderStatusTransitionError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'INVALID_ORDER_STATUS_TRANSITION'
  }

  function isInsufficientStockError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'INSUFFICIENT_STOCK'
  }

  function isOrderCannotBeCancelledError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'ORDER_CANNOT_BE_CANCELLED'
  }

  function stopMyOrderSubscriptions(): void {
    myOrderSubscriptionCleanup?.()
    myOrderSubscriptionCleanup = null
  }

  function stopAdminOrderSubscriptions(): void {
    adminOrderSubscriptionCleanup?.()
    adminOrderSubscriptionCleanup = null
  }

  function subscribeToMyOrderEvents(): () => void {
    stopMyOrderSubscriptions()

    const createdSubscription = apolloClient
      .subscribe<OrderCreatedSubscription>({
        query: ORDER_CREATED_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const order = data?.orderCreated

          if (order) {
            upsertMyOrder(order)
          }
        },
      })

    const updatedSubscription = apolloClient
      .subscribe<OrderUpdatedSubscription>({
        query: ORDER_UPDATED_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const order = data?.orderUpdated

          if (order) {
            upsertMyOrder(order)
          }
        },
      })

    const cleanup = (): void => {
      createdSubscription.unsubscribe()
      updatedSubscription.unsubscribe()
      myOrderSubscriptionCleanup = null
    }

    myOrderSubscriptionCleanup = cleanup

    return cleanup
  }

  function subscribeToAdminOrderEvents(
    filters: AdminOrdersQueryVariables = {},
  ): () => void {
    stopAdminOrderSubscriptions()

    const createdSubscription = apolloClient
      .subscribe<AdminOrderCreatedSubscription>({
        query: ADMIN_ORDER_CREATED_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const order = data?.orderCreated

          if (order && orderMatchesAdminFilters(order, filters)) {
            upsertAdminOrder(order)
          }
        },
      })

    const updatedSubscription = apolloClient
      .subscribe<AdminOrderUpdatedSubscription>({
        query: ADMIN_ORDER_UPDATED_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const order = data?.orderUpdated

          if (order && orderMatchesAdminFilters(order, filters)) {
            upsertAdminOrder(order)
          }
        },
      })

    const cleanup = (): void => {
      createdSubscription.unsubscribe()
      updatedSubscription.unsubscribe()
      adminOrderSubscriptionCleanup = null
    }

    adminOrderSubscriptionCleanup = cleanup

    return cleanup
  }

  return {
    myOrders,
    adminOrders,
    dailyOverview,
    weeklyStatistics,
    weeklySummary,
    loading,
    errorMessage,
    adminOrdersLoading,
    adminOrdersError,
    ordersLoading: adminOrdersLoading,
    ordersError: adminOrdersError,
    adminOverviewLoading,
    adminOverviewError,
    adminWeeklyStatsLoading,
    adminWeeklyStatsError,
    statusActionLoading,
    statusActionError,
    cancelActionLoading,
    cancelActionError,
    hasWeeklyWarning,
    loadMyOrders,
    loadWeeklySummary,
    createOrder,
    cancelOwnOrder,
    loadAdminOrders,
    loadAdminDailyOverview,
    loadAdminWeeklyStatistics,
    updateOrderStatus,
    cancelOrderAsAdmin,
    clearStatusActionError,
    clearCancelActionError,
    subscribeToMyOrderEvents,
    subscribeToAdminOrderEvents,
    stopMyOrderSubscriptions,
    stopAdminOrderSubscriptions,
    isWeeklyLimitExceededError,
    isDailyLimitExceededError,
    isVaccineInactiveError,
    isOrderCannotBeCancelledError,
    isInvalidOrderStatusTransitionError,
    isInsufficientStockError,
    mapGraphQLError,
  }
}

function isWeeklyLimitExceededError(error: unknown): boolean {
  return extractGraphQLErrorCode(error) === 'WEEKLY_LIMIT_EXCEEDED'
}

function isDailyLimitExceededError(error: unknown): boolean {
  return extractGraphQLErrorCode(error) === 'DAILY_LIMIT_EXCEEDED'
}

function isVaccineInactiveError(error: unknown): boolean {
  return extractGraphQLErrorCode(error) === 'VACCINE_INACTIVE'
}
