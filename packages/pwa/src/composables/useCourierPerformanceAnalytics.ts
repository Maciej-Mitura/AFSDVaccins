import { ApolloError } from '@apollo/client/core'
import { CourierAnalyticsDataCompleteness } from '@vaccin-delivery/types'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  COURIER_PERFORMANCE_ANALYTICS_QUERY,
  type CourierPerformanceAnalyticsQuery,
  type CourierPerformanceAnalyticsQueryVariables,
} from '@/assets/graphql/courier-analytics'
import {
  CourierAnalyticsRestError,
  downloadCourierAnalyticsCsv,
  fetchCourierPerformanceCsv,
  type CourierAnalyticsRestErrorCode,
} from '@/api/courier-analytics-rest'
import {
  findRankingById,
  hasDataQualityIssues,
  hasMeaningfulAnalytics,
  mapComponentMatrix,
  mapDistribution,
  mapHandlingDurations,
  mapKpiCards,
  mapMonthlyActivityChronological,
  mapScoreComparison,
  type AnalyticsPayload,
  type DetailPanelVm,
} from '@/composables/courier-analytics-mappers'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL from '@/composables/useGraphQL'
import { formatDateTime } from '@/i18n'

function mapCsvErrorMessage(
  t: (key: string) => string,
  code: CourierAnalyticsRestErrorCode,
): string {
  switch (code) {
    case 'COURIER_ANALYTICS_FORBIDDEN':
    case 'UNAUTHENTICATED':
      return t('admin.courierAnalytics.export.error.forbidden')
    case 'NETWORK_ERROR':
      return t('admin.courierAnalytics.export.error.network')
    case 'COURIER_ANALYTICS_INVALID_RESPONSE':
      return t('admin.courierAnalytics.export.error.invalid')
    default:
      return t('admin.courierAnalytics.export.error.failed')
  }
}

/**
 * ADMIN courier-performance analytics data + CSV export.
 * Does not recalculate scores; preserves backend ranking order.
 */
export function useCourierPerformanceAnalytics() {
  const { t } = useI18n()
  const { apolloClient } = useGraphQL()

  const loading = ref(false)
  const refreshing = ref(false)
  const exporting = ref(false)
  const errorMessage = ref<string | null>(null)
  const exportErrorMessage = ref<string | null>(null)
  const exportSuccessMessage = ref<string | null>(null)
  const payload = ref<AnalyticsPayload | null>(null)
  const selectedCourierProfileId = ref<string | null>(null)

  let refreshInFlight = false
  let loadInFlight = false

  const generatedAtLabel = computed(() => {
    if (!payload.value?.generatedAt) {
      return null
    }
    return formatDateTime(payload.value.generatedAt)
  })

  const hasData = computed(() =>
    payload.value ? hasMeaningfulAnalytics(payload.value) : false,
  )

  const showDataQuality = computed(() =>
    payload.value ? hasDataQualityIssues(payload.value.dataQuality) : false,
  )

  const kpiCards = computed(() =>
    payload.value ? mapKpiCards(payload.value.summary) : [],
  )

  const rankings = computed(() => payload.value?.courierRankings ?? [])

  const scoreComparison = computed(() =>
    mapScoreComparison(rankings.value, { includeInsufficient: false }),
  )

  const insufficientExcludedFromScoreChart = computed(
    () =>
      rankings.value.filter(
        r =>
          r.dataCompleteness === CourierAnalyticsDataCompleteness.Insufficient,
      ).length,
  )

  const componentMatrix = computed(() =>
    mapComponentMatrix(rankings.value, { eligibleOnly: true }),
  )

  const monthlyActivity = computed(() =>
    mapMonthlyActivityChronological(payload.value?.monthlyActivity ?? []),
  )

  const routeStatusDistribution = computed(() =>
    mapDistribution(payload.value?.routeStatusDistribution ?? []),
  )

  const timelinessDistribution = computed(() =>
    mapDistribution(payload.value?.deliveryTimelinessDistribution ?? []),
  )

  const proofDistribution = computed(() =>
    mapDistribution(payload.value?.deliveryProofDistribution ?? []),
  )

  const handlingDurations = computed(() => mapHandlingDurations(rankings.value))

  const selectedCourier = computed<DetailPanelVm | null>(() =>
    findRankingById(rankings.value, selectedCourierProfileId.value),
  )

  const dataQuality = computed(() => payload.value?.dataQuality ?? null)
  const summary = computed(() => payload.value?.summary ?? null)

  async function load(options?: { refresh?: boolean }): Promise<void> {
    const refresh = options?.refresh === true

    if (refresh) {
      if (refreshInFlight) {
        return
      }
      refreshInFlight = true
      refreshing.value = true
    } else {
      if (loadInFlight) {
        return
      }
      loadInFlight = true
      loading.value = true
    }

    errorMessage.value = null

    try {
      const result = await apolloClient.query<
        CourierPerformanceAnalyticsQuery,
        CourierPerformanceAnalyticsQueryVariables
      >({
        query: COURIER_PERFORMANCE_ANALYTICS_QUERY,
        variables: { refresh },
        fetchPolicy: 'network-only',
      })

      const next = result.data?.courierPerformanceAnalytics ?? null
      payload.value = next

      if (
        selectedCourierProfileId.value &&
        next &&
        !next.courierRankings.some(
          r => r.courierProfileId === selectedCourierProfileId.value,
        )
      ) {
        selectedCourierProfileId.value = null
      }
    } catch (error: unknown) {
      payload.value = null
      if (error instanceof ApolloError) {
        errorMessage.value = mapGraphQLError(error)
      } else {
        errorMessage.value = t('admin.courierAnalytics.error.loadFailed')
      }
    } finally {
      if (refresh) {
        refreshing.value = false
        refreshInFlight = false
      } else {
        loading.value = false
        loadInFlight = false
      }
    }
  }

  async function refresh(): Promise<void> {
    await load({ refresh: true })
  }

  function selectCourier(courierProfileId: string | null): void {
    selectedCourierProfileId.value = courierProfileId
  }

  function clearSelection(): void {
    selectedCourierProfileId.value = null
  }

  async function exportCsv(): Promise<boolean> {
    exportErrorMessage.value = null
    exportSuccessMessage.value = null
    exporting.value = true
    try {
      const result = await fetchCourierPerformanceCsv()
      downloadCourierAnalyticsCsv(result.blob, result.filename)
      exportSuccessMessage.value = t('admin.courierAnalytics.export.success')
      return true
    } catch (error: unknown) {
      if (error instanceof CourierAnalyticsRestError) {
        exportErrorMessage.value = mapCsvErrorMessage(t, error.code)
      } else {
        exportErrorMessage.value = t(
          'admin.courierAnalytics.export.error.failed',
        )
      }
      return false
    } finally {
      exporting.value = false
    }
  }

  function clearExportFeedback(): void {
    exportErrorMessage.value = null
    exportSuccessMessage.value = null
  }

  return {
    loading,
    refreshing,
    exporting,
    errorMessage,
    exportErrorMessage,
    exportSuccessMessage,
    payload,
    generatedAtLabel,
    hasData,
    showDataQuality,
    kpiCards,
    rankings,
    scoreComparison,
    insufficientExcludedFromScoreChart,
    componentMatrix,
    monthlyActivity,
    routeStatusDistribution,
    timelinessDistribution,
    proofDistribution,
    handlingDurations,
    selectedCourier,
    selectedCourierProfileId,
    dataQuality,
    summary,
    load,
    refresh,
    selectCourier,
    clearSelection,
    exportCsv,
    clearExportFeedback,
  }
}
