import { ref } from 'vue'

import { useI18n } from 'vue-i18n'

import {
  DeliveryManifestRestError,
  downloadManifestPdf,
  fetchRouteManifestPdf,
  fetchStopManifestPdf,
  type DeliveryManifestRestErrorCode,
} from '@/api/delivery-manifest-rest'

function mapManifestErrorMessage(
  t: (key: string) => string,
  code: DeliveryManifestRestErrorCode,
): string {
  switch (code) {
    case 'DELIVERY_MANIFEST_FORBIDDEN':
    case 'UNAUTHENTICATED':
      return t('deliveryManifest.error.forbidden')
    case 'DELIVERY_MANIFEST_ROUTE_NOT_FOUND':
    case 'DELIVERY_MANIFEST_STOP_NOT_FOUND':
    case 'DELIVERY_MANIFEST_ROUTE_UNAVAILABLE':
      return t('deliveryManifest.error.unavailable')
    case 'NETWORK_ERROR':
      return t('deliveryManifest.error.unable')
    default:
      return t('deliveryManifest.error.unable')
  }
}

/**
 * Minimal authenticated PDF download helper for route/stop manifests.
 */
export function useDeliveryManifestDownload() {
  const { t } = useI18n()
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)
  const successMessage = ref<string | null>(null)

  function clearFeedback(): void {
    errorMessage.value = null
    successMessage.value = null
  }

  async function downloadRouteManifest(
    routeId: string,
    routeDate: string,
  ): Promise<boolean> {
    clearFeedback()
    loading.value = true
    try {
      const result = await fetchRouteManifestPdf(routeId, routeDate)
      downloadManifestPdf(result.blob, result.filename)
      successMessage.value = t('deliveryManifest.downloaded')
      return true
    } catch (error: unknown) {
      if (error instanceof DeliveryManifestRestError) {
        errorMessage.value = mapManifestErrorMessage(t, error.code)
      } else {
        errorMessage.value = t('deliveryManifest.error.unable')
      }
      return false
    } finally {
      loading.value = false
    }
  }

  async function downloadStopManifest(
    routeId: string,
    stopId: string,
    routeDate: string,
    stopSequence: number,
  ): Promise<boolean> {
    clearFeedback()
    loading.value = true
    try {
      const result = await fetchStopManifestPdf(
        routeId,
        stopId,
        routeDate,
        stopSequence,
      )
      downloadManifestPdf(result.blob, result.filename)
      successMessage.value = t('deliveryManifest.downloaded')
      return true
    } catch (error: unknown) {
      if (error instanceof DeliveryManifestRestError) {
        errorMessage.value = mapManifestErrorMessage(t, error.code)
      } else {
        errorMessage.value = t('deliveryManifest.error.unable')
      }
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    errorMessage,
    successMessage,
    clearFeedback,
    downloadRouteManifest,
    downloadStopManifest,
  }
}
