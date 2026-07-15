import { computed, ref } from 'vue'
import { ApolloError } from '@apollo/client/core'

import {
  ADJUST_VACCINE_STOCK_MUTATION,
  type AdjustVaccineStockMutation,
  type AdjustVaccineStockMutationVariables,
} from '@/assets/graphql/stock.mutation'
import {
  STOCK_ADJUSTMENTS_QUERY,
  VACCINE_STOCK_HISTORY_QUERY,
  type StockAdjustmentsQuery,
  type VaccineStockHistoryQuery,
} from '@/assets/graphql/stock.query'
import {
  VACCINES_QUERY,
  type VaccinesQuery,
} from '@/assets/graphql/vaccine'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL from '@/composables/useGraphQL'

export type StockOverviewItem = VaccinesQuery['vaccines'][number]
export type StockAdjustmentItem =
  StockAdjustmentsQuery['stockAdjustments'][number]
export type StockHistoryItem =
  VaccineStockHistoryQuery['vaccineStockHistory'][number]
export type StockAdjustmentResult =
  AdjustVaccineStockMutation['adjustVaccineStock']

const overview = ref<StockOverviewItem[]>([])
const adjustments = ref<StockAdjustmentItem[]>([])
const history = ref<StockHistoryItem[]>([])
const loading = ref(false)
const adjusting = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)

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

export function useStock() {
  const { apolloClient } = useGraphQL()

  const lowStockVaccines = computed(() =>
    overview.value.filter(
      vaccine => vaccine.stockQuantity <= vaccine.stockWarningThreshold,
    ),
  )

  async function loadStockOverview(includeInactive = true): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<VaccinesQuery>({
        query: VACCINES_QUERY,
        variables: { includeInactive },
        fetchPolicy: 'network-only',
      })

      overview.value = result.data.vaccines
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function adjustStock(
    input: AdjustVaccineStockMutationVariables['input'],
  ): Promise<StockAdjustmentResult> {
    adjusting.value = true
    errorMessage.value = null
    successMessage.value = null

    try {
      const result = await apolloClient.mutate<AdjustVaccineStockMutation>({
        mutation: ADJUST_VACCINE_STOCK_MUTATION,
        variables: { input },
      })

      if (!result.data?.adjustVaccineStock) {
        throw new Error('Kon de voorraad niet aanpassen.')
      }

      const adjustment = result.data.adjustVaccineStock
      overview.value = overview.value.map(vaccine =>
        vaccine.id === adjustment.vaccineId
          ? { ...vaccine, stockQuantity: adjustment.quantityAfter }
          : vaccine,
      )

      successMessage.value = `Voorraad bijgewerkt: ${adjustment.quantityBefore} → ${adjustment.quantityAfter}.`
      return adjustment
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      adjusting.value = false
    }
  }

  async function loadStockAdjustments(vaccineId?: string): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<StockAdjustmentsQuery>({
        query: STOCK_ADJUSTMENTS_QUERY,
        variables: { vaccineId },
        fetchPolicy: 'network-only',
      })

      adjustments.value = result.data.stockAdjustments
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function loadVaccineStockHistory(vaccineId: string): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<VaccineStockHistoryQuery>({
        query: VACCINE_STOCK_HISTORY_QUERY,
        variables: { vaccineId },
        fetchPolicy: 'network-only',
      })

      history.value = result.data.vaccineStockHistory
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  function isInsufficientStockError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'INSUFFICIENT_STOCK'
  }

  function isInvalidStockAdjustmentError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'INVALID_STOCK_ADJUSTMENT'
  }

  function isVaccineNotFoundError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'VACCINE_NOT_FOUND'
  }

  return {
    overview,
    adjustments,
    history,
    lowStockVaccines,
    loading,
    adjusting,
    errorMessage,
    successMessage,
    loadStockOverview,
    adjustStock,
    loadStockAdjustments,
    loadVaccineStockHistory,
    isInsufficientStockError,
    isInvalidStockAdjustmentError,
    isVaccineNotFoundError,
    mapGraphQLError,
  }
}
