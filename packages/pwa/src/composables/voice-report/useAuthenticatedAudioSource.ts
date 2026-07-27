import {
  onBeforeUnmount,
  getCurrentInstance,
  readonly,
  ref,
  type Ref,
} from 'vue'

import { fetchRouteVoiceReportAudio } from '@/api/route-voice-report-rest'
import {
  RouteVoiceReportRestError,
  mapRouteVoiceReportErrorCode,
} from '@/api/route-voice-report-errors'

export type UseAuthenticatedAudioSourceResult = {
  objectUrl: Readonly<Ref<string | null>>
  loading: Readonly<Ref<boolean>>
  errorMessage: Readonly<Ref<string | null>>
  loadedReportId: Readonly<Ref<string | null>>
  load: (routeId: string, reportId: string) => Promise<string | null>
  clear: () => void
}

/**
 * Fetch private voice-report audio with Firebase bearer auth and expose a Blob URL.
 * Never puts the authenticated REST endpoint into <audio src>.
 */
export function useAuthenticatedAudioSource(): UseAuthenticatedAudioSourceResult {
  const objectUrl = ref<string | null>(null)
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)
  const loadedReportId = ref<string | null>(null)

  function revokeCurrent(): void {
    if (objectUrl.value) {
      try {
        URL.revokeObjectURL(objectUrl.value)
      } catch {
        // Ignore.
      }
      objectUrl.value = null
    }
    loadedReportId.value = null
  }

  function clear(): void {
    revokeCurrent()
    errorMessage.value = null
    loading.value = false
  }

  async function load(
    routeId: string,
    reportId: string,
  ): Promise<string | null> {
    if (loadedReportId.value === reportId && objectUrl.value) {
      return objectUrl.value
    }

    loading.value = true
    errorMessage.value = null
    revokeCurrent()

    try {
      const result = await fetchRouteVoiceReportAudio(routeId, reportId)
      const url = URL.createObjectURL(result.blob)
      objectUrl.value = url
      loadedReportId.value = reportId
      return url
    } catch (error: unknown) {
      const code =
        error instanceof RouteVoiceReportRestError
          ? error.code
          : 'NETWORK_ERROR'
      errorMessage.value = mapRouteVoiceReportErrorCode(code)
      return null
    } finally {
      loading.value = false
    }
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      revokeCurrent()
    })
  }

  return {
    objectUrl: readonly(objectUrl),
    loading: readonly(loading),
    errorMessage: readonly(errorMessage),
    loadedReportId: readonly(loadedReportId),
    load,
    clear,
  }
}
