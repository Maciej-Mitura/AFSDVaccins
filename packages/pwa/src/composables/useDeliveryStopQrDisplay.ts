import { computed, getCurrentInstance, onUnmounted, ref, watch, type Ref } from 'vue'

import { DeliveryQrRestError } from '@/api/delivery-qr-errors'
import {
  isDeliveryStopQrInactiveError,
  mapDeliveryStopQrDisplayError,
} from '@/api/delivery-stop-qr-display-errors'
import {
  buildDeliveryStopQrDownloadFilename,
  downloadDeliveryStopQrSvg,
  fetchDeliveryStopQrImage,
} from '@/api/delivery-stop-qr-image-rest'
import {
  DELIVERY_STOP_QR_QUERY,
  type DeliveryStopQrQuery,
} from '@/assets/graphql/delivery-stop-qr'
import useGraphQL from '@/composables/useGraphQL'

export type DeliveryStopQrModalOrderLine = {
  vaccineId: string
  vaccineName: string
  quantity: number
}

export type DeliveryStopQrModalOrder = {
  orderId: string
  status: string
  lines: DeliveryStopQrModalOrderLine[]
}

export type DeliveryStopQrModalContext = {
  routeId: string
  stopId: string
  routeDate: string
  routeStatus?: string
  stopSequence: number
  pharmacyName: string
  address: {
    street: string
    houseNumber: string
    postalCode: string
    city: string
    country?: string
  }
  orderCount: number
  orders: DeliveryStopQrModalOrder[]
  totalLineCount?: number
  totalQuantity?: number
  qrAvailable: boolean
  qrConsumed: boolean
}

/**
 * Shared pharmacy/admin delivery-stop QR modal state + object URL lifecycle.
 */
export function useDeliveryStopQrDisplay(options?: {
  /** When authoritative stop state becomes consumed/unavailable, close active QR. */
  authoritativeStops?: Ref<
    Array<{
      routeId: string
      stopId: string | null | undefined
      qrAvailable?: boolean | null
      qrConsumed?: boolean | null
    }>
  >
}) {
  const { apolloClient } = useGraphQL()

  const open = ref(false)
  const context = ref<DeliveryStopQrModalContext | null>(null)
  const objectUrl = ref<string | null>(null)
  const imageBlob = ref<Blob | null>(null)
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)
  const inactiveMessage = ref<string | null>(null)
  let originButton: HTMLElement | null = null

  function revokeObjectUrl(): void {
    if (objectUrl.value) {
      URL.revokeObjectURL(objectUrl.value)
      objectUrl.value = null
    }
    imageBlob.value = null
  }

  function resetTransientState(): void {
    revokeObjectUrl()
    errorMessage.value = null
    inactiveMessage.value = null
    loading.value = false
  }

  function closeModal(): void {
    open.value = false
    context.value = null
    resetTransientState()
    const button = originButton
    originButton = null
    if (button && typeof button.focus === 'function') {
      queueMicrotask(() => button.focus())
    }
  }

  async function loadQrImage(routeId: string, stopId: string): Promise<void> {
    loading.value = true
    errorMessage.value = null
    inactiveMessage.value = null
    revokeObjectUrl()

    try {
      const meta = await apolloClient.query<DeliveryStopQrQuery>({
        query: DELIVERY_STOP_QR_QUERY,
        variables: { routeId, stopId },
        fetchPolicy: 'network-only',
      })

      const stopQr = meta.data.deliveryStopQr
      if (!stopQr.qrAvailable || stopQr.qrConsumed || !stopQr.qrImagePath) {
        inactiveMessage.value = mapDeliveryStopQrDisplayError(
          new DeliveryQrRestError(
            400,
            stopQr.qrConsumed
              ? 'DELIVERY_QR_CONSUMED'
              : 'DELIVERY_QR_NOT_AVAILABLE',
          ),
        )
        return
      }

      if (context.value) {
        context.value = {
          ...context.value,
          pharmacyName: stopQr.pharmacyName,
          address: stopQr.address,
          routeDate: stopQr.routeDate,
          orderCount: stopQr.orderCount,
          qrAvailable: stopQr.qrAvailable,
          qrConsumed: stopQr.qrConsumed,
        }
      }

      const image = await fetchDeliveryStopQrImage(routeId, stopId)
      objectUrl.value = image.objectUrl
      imageBlob.value = image.blob
    } catch (error: unknown) {
      const code =
        error instanceof DeliveryQrRestError ? error.code : 'UNKNOWN'
      errorMessage.value = mapDeliveryStopQrDisplayError(error)

      if (isDeliveryStopQrInactiveError(code)) {
        inactiveMessage.value = errorMessage.value
        revokeObjectUrl()
      }
    } finally {
      loading.value = false
    }
  }

  async function openDeliveryStopQr(
    next: DeliveryStopQrModalContext,
    trigger?: EventTarget | null,
  ): Promise<void> {
    if (trigger instanceof HTMLElement) {
      originButton = trigger
    }

    resetTransientState()
    context.value = next
    open.value = true

    if (!next.qrAvailable || next.qrConsumed || !next.stopId) {
      inactiveMessage.value = mapDeliveryStopQrDisplayError(
        new DeliveryQrRestError(
          400,
          next.qrConsumed
            ? 'DELIVERY_QR_CONSUMED'
            : 'DELIVERY_QR_NOT_AVAILABLE',
        ),
      )
      return
    }

    await loadQrImage(next.routeId, next.stopId)
  }

  async function retry(): Promise<void> {
    const current = context.value
    if (!current?.stopId) {
      return
    }
    await loadQrImage(current.routeId, current.stopId)
  }

  function downloadQr(): void {
    const current = context.value
    const blob = imageBlob.value
    if (!current || !blob) {
      return
    }

    downloadDeliveryStopQrSvg(
      blob,
      buildDeliveryStopQrDownloadFilename(
        current.routeDate,
        current.stopSequence,
      ),
    )
  }

  const canDownload = computed(
    () => objectUrl.value != null && imageBlob.value != null && !loading.value,
  )

  const downloadFilename = computed(() => {
    const current = context.value
    if (!current) {
      return ''
    }
    return buildDeliveryStopQrDownloadFilename(
      current.routeDate,
      current.stopSequence,
    )
  })

  if (options?.authoritativeStops) {
    watch(
      options.authoritativeStops,
      stops => {
        const current = context.value
        if (!open.value || !current?.stopId) {
          return
        }

        const match = stops.find(
          stop =>
            stop.routeId === current.routeId && stop.stopId === current.stopId,
        )

        if (!match) {
          return
        }

        if (match.qrConsumed || match.qrAvailable === false) {
          revokeObjectUrl()
          inactiveMessage.value = mapDeliveryStopQrDisplayError(
            new DeliveryQrRestError(
              400,
              match.qrConsumed
                ? 'DELIVERY_QR_CONSUMED'
                : 'DELIVERY_QR_NOT_AVAILABLE',
            ),
          )
          if (context.value) {
            context.value = {
              ...context.value,
              qrAvailable: Boolean(match.qrAvailable),
              qrConsumed: Boolean(match.qrConsumed),
            }
          }
        }
      },
      { deep: true },
    )
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      revokeObjectUrl()
    })
  }

  return {
    open,
    context,
    objectUrl,
    loading,
    errorMessage,
    inactiveMessage,
    canDownload,
    downloadFilename,
    openDeliveryStopQr,
    closeModal,
    retry,
    downloadQr,
    revokeObjectUrl,
  }
}
