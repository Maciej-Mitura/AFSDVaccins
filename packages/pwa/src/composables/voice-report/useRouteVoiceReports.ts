import { ApolloError } from '@apollo/client/core'
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'

import {
  ROUTE_VOICE_REPORTS_QUERY,
  ROUTE_VOICE_REPORT_UPDATES_SUBSCRIPTION,
  type RouteVoiceReportsQuery,
  type RouteVoiceReportUpdatesSubscription,
} from '@/assets/graphql/route-voice-reports'
import {
  RouteVoiceReportRestError,
  mapRouteVoiceReportErrorCode,
} from '@/api/route-voice-report-errors'
import {
  retryRouteVoiceReportTranscription,
  uploadRouteVoiceReport,
  type RouteVoiceReportSelectedLocale,
  type RouteVoiceReportUploadResponse,
} from '@/api/route-voice-report-rest'
import useGraphQL, { registerReconnectHandler } from '@/composables/useGraphQL'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { mapUserFacingGraphQLError } from '@/i18n/error-mapper'
import type { RouteDataSource } from '@/offline/ui-error-category'

export type RouteVoiceReportItem =
  RouteVoiceReportsQuery['routeVoiceReports'][number]

export type UseRouteVoiceReportsOptions = {
  routeId: Ref<string | null | undefined>
  /** When CACHE/NONE, do not query or subscribe. */
  routeSource: Ref<RouteDataSource>
  /** When false, skip GraphQL/REST (e.g. APOTHEKER). */
  enabled?: Ref<boolean> | ComputedRef<boolean>
  /** Allow ADMIN retry transcription. */
  canRetryTranscription?: Ref<boolean> | ComputedRef<boolean>
}

export type UseRouteVoiceReportsResult = {
  reports: Readonly<Ref<RouteVoiceReportItem[]>>
  loading: Readonly<Ref<boolean>>
  refreshing: Readonly<Ref<boolean>>
  errorMessage: Readonly<Ref<string | null>>
  uploading: Readonly<Ref<boolean>>
  uploadErrorMessage: Readonly<Ref<string | null>>
  retryingReportId: Readonly<Ref<string | null>>
  retryErrorMessage: Readonly<Ref<string | null>>
  lastUploadSuccess: Readonly<Ref<boolean>>
  loadReports: () => Promise<void>
  refetchReports: () => Promise<void>
  subscribe: () => () => void
  stopSubscription: () => void
  uploadReport: (input: {
    audio: Blob
    clientRecordedAt: string
    durationSeconds: number
    selectedLocale: RouteVoiceReportSelectedLocale
    clientUploadId: string
  }) => Promise<RouteVoiceReportUploadResponse | null>
  retryTranscription: (reportId: string) => Promise<boolean>
  clearUploadFeedback: () => void
}

const REFETCH_DEBOUNCE_MS = 300

/**
 * Query + PubSub refetch + multipart upload + ADMIN transcription retry
 * for route-scoped voice reports.
 */
export function useRouteVoiceReports(
  options: UseRouteVoiceReportsOptions,
): UseRouteVoiceReportsResult {
  const { apolloClient } = useGraphQL()
  const { isOnline } = useOnlineStatus()

  const reports = ref<RouteVoiceReportItem[]>([])
  const loading = ref(false)
  const refreshing = ref(false)
  const errorMessage = ref<string | null>(null)
  const uploading = ref(false)
  const uploadErrorMessage = ref<string | null>(null)
  const retryingReportId = ref<string | null>(null)
  const retryErrorMessage = ref<string | null>(null)
  const lastUploadSuccess = ref(false)

  let subscriptionCleanup: (() => void) | null = null
  let reconnectCleanup: (() => void) | null = null
  let refetchTimer: ReturnType<typeof setTimeout> | null = null
  let loadGeneration = 0

  const enabled = computed(() => {
    if (options.enabled && !options.enabled.value) {
      return false
    }
    return true
  })

  const canRetry = computed(() => options.canRetryTranscription?.value === true)

  function clearReports(): void {
    reports.value = []
    errorMessage.value = null
  }

  function scheduleRefetch(): void {
    if (refetchTimer) {
      clearTimeout(refetchTimer)
    }
    refetchTimer = setTimeout(() => {
      refetchTimer = null
      void refetchReports()
    }, REFETCH_DEBOUNCE_MS)
  }

  async function loadReports(): Promise<void> {
    const routeId = options.routeId.value
    if (!routeId || !enabled.value) {
      clearReports()
      return
    }

    if (options.routeSource.value !== 'SERVER') {
      clearReports()
      return
    }

    if (!isOnline.value) {
      clearReports()
      return
    }

    const generation = ++loadGeneration
    const isRefresh = reports.value.length > 0
    if (isRefresh) {
      refreshing.value = true
    } else {
      loading.value = true
    }
    errorMessage.value = null

    try {
      const result = await apolloClient.query<RouteVoiceReportsQuery>({
        query: ROUTE_VOICE_REPORTS_QUERY,
        variables: { routeId },
        fetchPolicy: 'network-only',
      })

      if (generation !== loadGeneration) {
        return
      }

      reports.value = result.data?.routeVoiceReports ?? []
    } catch (error: unknown) {
      if (generation !== loadGeneration) {
        return
      }
      if (error instanceof ApolloError) {
        errorMessage.value = mapUserFacingGraphQLError(error)
      } else {
        errorMessage.value = mapRouteVoiceReportErrorCode('NETWORK_ERROR')
      }
    } finally {
      if (generation === loadGeneration) {
        loading.value = false
        refreshing.value = false
      }
    }
  }

  async function refetchReports(): Promise<void> {
    await loadReports()
  }

  function stopSubscription(): void {
    subscriptionCleanup?.()
    subscriptionCleanup = null
    reconnectCleanup?.()
    reconnectCleanup = null
    if (refetchTimer) {
      clearTimeout(refetchTimer)
      refetchTimer = null
    }
  }

  function subscribe(): () => void {
    stopSubscription()

    const routeId = options.routeId.value
    if (!routeId || !enabled.value || options.routeSource.value !== 'SERVER') {
      return () => undefined
    }

    const subscription = apolloClient
      .subscribe<RouteVoiceReportUpdatesSubscription>({
        query: ROUTE_VOICE_REPORT_UPDATES_SUBSCRIPTION,
      })
      .subscribe({
        next: ({ data }) => {
          const update = data?.routeVoiceReportUpdates
          if (!update) {
            return
          }
          const activeRouteId = options.routeId.value
          if (!activeRouteId || update.routeId !== activeRouteId) {
            return
          }
          scheduleRefetch()
        },
      })

    reconnectCleanup = registerReconnectHandler(() => {
      void refetchReports()
    })

    const cleanup = (): void => {
      subscription.unsubscribe()
      reconnectCleanup?.()
      reconnectCleanup = null
      subscriptionCleanup = null
    }

    subscriptionCleanup = cleanup
    return cleanup
  }

  async function uploadReport(input: {
    audio: Blob
    clientRecordedAt: string
    durationSeconds: number
    selectedLocale: RouteVoiceReportSelectedLocale
    clientUploadId: string
  }): Promise<RouteVoiceReportUploadResponse | null> {
    const routeId = options.routeId.value
    if (!routeId || uploading.value) {
      return null
    }

    if (!isOnline.value) {
      uploadErrorMessage.value = mapRouteVoiceReportErrorCode('NETWORK_ERROR')
      lastUploadSuccess.value = false
      return null
    }

    uploading.value = true
    uploadErrorMessage.value = null
    lastUploadSuccess.value = false

    try {
      const response = await uploadRouteVoiceReport(routeId, input)
      lastUploadSuccess.value = true
      await refetchReports()
      return response
    } catch (error: unknown) {
      const code =
        error instanceof RouteVoiceReportRestError
          ? error.code
          : 'NETWORK_ERROR'
      uploadErrorMessage.value = mapRouteVoiceReportErrorCode(code)
      lastUploadSuccess.value = false
      return null
    } finally {
      uploading.value = false
    }
  }

  async function retryTranscription(reportId: string): Promise<boolean> {
    const routeId = options.routeId.value
    if (!routeId || !canRetry.value || retryingReportId.value) {
      return false
    }

    retryingReportId.value = reportId
    retryErrorMessage.value = null

    try {
      await retryRouteVoiceReportTranscription(routeId, reportId)
      await refetchReports()
      return true
    } catch (error: unknown) {
      const code =
        error instanceof RouteVoiceReportRestError
          ? error.code
          : 'NETWORK_ERROR'
      retryErrorMessage.value = mapRouteVoiceReportErrorCode(code)
      return false
    } finally {
      retryingReportId.value = null
    }
  }

  function clearUploadFeedback(): void {
    uploadErrorMessage.value = null
    lastUploadSuccess.value = false
  }

  watch(
    [
      () => options.routeId.value,
      () => options.routeSource.value,
      () => enabled.value,
      isOnline,
    ],
    ([routeId, source, isEnabled, online]) => {
      stopSubscription()
      if (!routeId || !isEnabled || source !== 'SERVER' || !online) {
        if (source !== 'SERVER') {
          clearReports()
        }
        return
      }
      void loadReports()
      subscribe()
    },
    { immediate: true },
  )

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      stopSubscription()
      loadGeneration += 1
    })
  }

  return {
    reports,
    loading,
    refreshing,
    errorMessage,
    uploading,
    uploadErrorMessage,
    retryingReportId,
    retryErrorMessage,
    lastUploadSuccess,
    loadReports,
    refetchReports,
    subscribe,
    stopSubscription,
    uploadReport,
    retryTranscription,
    clearUploadFeedback,
  }
}
