<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NotificationType, RouteStatus } from '@vaccin-delivery/types'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import FeatureDeliveryStopQrModal from '@/components/feature/delivery-qr/FeatureDeliveryStopQrModal.vue'
import FeatureRouteLocationStatusCard from '@/components/feature/routes/FeatureRouteLocationStatusCard.vue'
import { toPharmacistNextStopLocationProps } from '@/components/feature/routes/route-location-status'
import { registerReconnectHandler } from '@/composables/useGraphQL'
import { useDeliveryStopQrDisplay } from '@/composables/useDeliveryStopQrDisplay'
import { useDeliveryManifestDownload } from '@/composables/useDeliveryManifestDownload'
import {
  useMyPlannedDeliveries,
  type PlannedDeliveryItem,
} from '@/composables/useMyPlannedDeliveries'
import {
  registerNotificationReceivedHandler,
  type NotificationListItem,
} from '@/composables/useNotifications'
import { formatDate, routeStatusLabel, translatePlural } from '@/i18n'

const { t } = useI18n()

const { plannedDeliveries, loading, errorMessage, loadMyPlannedDeliveries } =
  useMyPlannedDeliveries()

const authoritativeStops = computed(() =>
  plannedDeliveries.value.map(delivery => ({
    routeId: delivery.routeId,
    stopId: delivery.stopId,
    qrAvailable: delivery.qrAvailable,
    qrConsumed: delivery.qrConsumed,
  })),
)

const {
  open,
  context,
  objectUrl,
  loading: qrLoading,
  errorMessage: qrError,
  inactiveMessage,
  canDownload,
  downloadFilename,
  openDeliveryStopQr,
  closeModal,
  retry,
  downloadQr,
} = useDeliveryStopQrDisplay({ authoritativeStops })

const {
  loading: manifestLoading,
  errorMessage: manifestError,
  successMessage: manifestSuccess,
  downloadStopManifest,
} = useDeliveryManifestDownload()

const manifestActingKey = ref<string | null>(null)
const manifestFeedbackKey = ref<string | null>(null)

async function onDownloadStopManifest(
  delivery: PlannedDeliveryItem,
): Promise<void> {
  if (!delivery.stopId) {
    return
  }
  const key = `${delivery.routeId}:${delivery.stopId}`
  manifestActingKey.value = key
  manifestFeedbackKey.value = key
  try {
    await downloadStopManifest(
      delivery.routeId,
      delivery.stopId,
      delivery.routeDate,
      delivery.stopSequence,
    )
  } finally {
    manifestActingKey.value = null
  }
}

function isManifestActing(delivery: PlannedDeliveryItem): boolean {
  if (!delivery.stopId) {
    return false
  }
  return manifestActingKey.value === `${delivery.routeId}:${delivery.stopId}`
}

function isManifestFeedback(delivery: PlannedDeliveryItem): boolean {
  if (!delivery.stopId) {
    return false
  }
  return manifestFeedbackKey.value === `${delivery.routeId}:${delivery.stopId}`
}

let reconnectCleanup: (() => void) | null = null
let notificationHandlerCleanup: (() => void) | null = null
let visibilityCleanup: (() => void) | null = null

const PLANNED_DELIVERY_REFRESH_TYPES = new Set<NotificationType>([
  NotificationType.ApothekerNextStop,
  NotificationType.ApothekerDeliveryConfirmed,
  NotificationType.ApothekerRouteStarted,
])

function shouldShowNextStopLocation(delivery: PlannedDeliveryItem): boolean {
  return (
    delivery.isNextStop === true &&
    delivery.routeStatus === RouteStatus.InProgress &&
    !delivery.qrConsumed
  )
}

function onPlannedDeliveryNotification(
  notification: NotificationListItem,
): void {
  if (!PLANNED_DELIVERY_REFRESH_TYPES.has(notification.type)) {
    return
  }
  void loadMyPlannedDeliveries()
}

onMounted(() => {
  void loadMyPlannedDeliveries()
  reconnectCleanup = registerReconnectHandler(async () => {
    await loadMyPlannedDeliveries()
  })
  notificationHandlerCleanup = registerNotificationReceivedHandler(
    onPlannedDeliveryNotification,
  )
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void loadMyPlannedDeliveries()
    }
  }
  document.addEventListener('visibilitychange', onVisible)
  visibilityCleanup = () => {
    document.removeEventListener('visibilitychange', onVisible)
  }
})

onUnmounted(() => {
  reconnectCleanup?.()
  notificationHandlerCleanup?.()
  visibilityCleanup?.()
})

function deliveryStateLabel(delivery: PlannedDeliveryItem): string {
  if (delivery.qrConsumed) {
    return t('deliveryStopQr.state.confirmed')
  }
  if (!delivery.stopId || (!delivery.qrAvailable && !delivery.qrImagePath)) {
    return t('deliveryStopQr.state.unavailable')
  }
  if (delivery.qrAvailable) {
    return t('deliveryStopQr.state.available')
  }
  return t('deliveryStopQr.state.unavailable')
}

function canShowQr(delivery: PlannedDeliveryItem): boolean {
  return Boolean(
    delivery.stopId &&
    delivery.qrAvailable &&
    !delivery.qrConsumed &&
    delivery.qrImagePath,
  )
}

async function onShowQr(
  delivery: PlannedDeliveryItem,
  event: MouseEvent,
): Promise<void> {
  if (!delivery.stopId) {
    return
  }

  await openDeliveryStopQr(
    {
      routeId: delivery.routeId,
      stopId: delivery.stopId,
      routeDate: delivery.routeDate,
      routeStatus: delivery.routeStatus,
      stopSequence: delivery.stopSequence,
      pharmacyName: delivery.pharmacyName,
      address: delivery.address,
      orderCount: delivery.orderCount,
      orders: delivery.orders.map(order => ({
        orderId: order.orderId,
        status: order.status,
        lines: order.lines.map(line => ({
          vaccineId: line.vaccineId,
          vaccineName: line.vaccineName,
          quantity: line.quantity,
        })),
      })),
      totalLineCount: delivery.totalLineCount,
      totalQuantity: delivery.totalQuantity,
      qrAvailable: delivery.qrAvailable,
      qrConsumed: delivery.qrConsumed,
    },
    event.currentTarget,
  )
}
</script>

<template>
  <section
    class="space-y-3"
    data-testid="planned-deliveries-section"
  >
    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <h2 class="text-base font-semibold text-highlighted">
        {{ t('deliveryStopQr.planned.title') }}
      </h2>
    </div>

    <CommonLoadingSkeleton
      v-if="loading && plannedDeliveries.length === 0"
      data-testid="planned-deliveries-loading"
    />

    <CommonErrorState
      v-else-if="errorMessage"
      :title="t('deliveryStopQr.planned.loadFailed')"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="plannedDeliveries.length === 0"
      :title="t('deliveryStopQr.planned.empty.title')"
      :description="t('deliveryStopQr.planned.empty.description')"
    />

    <ul
      v-else
      class="divide-y divide-default"
      role="list"
      data-testid="planned-delivery-list"
    >
      <li
        v-for="delivery in plannedDeliveries"
        :key="`${delivery.routeId}-${delivery.stopId ?? delivery.stopSequence}`"
        class="space-y-3 py-4 text-sm"
        :class="delivery.qrConsumed ? 'text-muted' : undefined"
        data-testid="planned-delivery-card"
        :data-route-id="delivery.routeId"
        :data-stop-id="delivery.stopId ?? ''"
        :data-delivery-state="delivery.qrConsumed ? 'completed' : 'upcoming'"
      >
        <div class="flex flex-wrap items-center gap-2">
          <h3
            class="font-semibold"
            :class="delivery.qrConsumed ? undefined : 'text-highlighted'"
          >
            {{ formatDate(delivery.routeDate) }}
          </h3>
          <UBadge variant="subtle">{{
            routeStatusLabel(delivery.routeStatus)
          }}</UBadge>
          <UBadge
            :color="delivery.qrConsumed ? 'success' : 'neutral'"
            variant="subtle"
            data-testid="planned-delivery-state"
          >
            {{ deliveryStateLabel(delivery) }}
          </UBadge>
        </div>

        <p data-testid="planned-delivery-date" class="sr-only">
          <span class="font-medium">{{ t('orders.deliveryDate') }}:</span>
          {{ formatDate(delivery.routeDate) }}
        </p>

        <FeatureRouteLocationStatusCard
          v-if="shouldShowNextStopLocation(delivery)"
          variant="inset"
          v-bind="
            toPharmacistNextStopLocationProps({
              routeStatus: delivery.routeStatus,
              city: delivery.lastKnownCourierCity,
              recordedAt: delivery.lastKnownLocationRecordedAt,
              source: delivery.courierLocationSource,
            })
          "
        />

        <p :class="delivery.qrConsumed ? undefined : 'text-toned'">
          <span class="font-medium text-highlighted"
            >{{ t('deliveryStopQr.planned.pharmacy') }}:</span
          >
          {{ delivery.pharmacyName }}
        </p>

        <p :class="delivery.qrConsumed ? undefined : 'text-toned'">
          {{ translatePlural('routes.stop.orders', delivery.orderCount) }}
          ·
          {{
            t('deliveryStopQr.planned.totalLines', {
              count: delivery.totalLineCount,
            })
          }}
          ·
          {{
            translatePlural(
              'admin.orders.totalDoses',
              delivery.totalQuantity,
            )
          }}
        </p>

        <div v-if="delivery.orders.length > 0" class="space-y-1">
          <p class="font-medium text-highlighted">
            {{ t('deliveryStopQr.modal.includedOrders') }}
          </p>
          <ul class="divide-y divide-default rounded-md bg-muted px-3 text-muted">
            <li
              v-for="order in delivery.orders"
              :key="order.orderId"
              class="py-1.5 text-xs"
              data-testid="planned-delivery-order-ref"
            >
              {{ t('admin.orders.orderId', { id: order.orderId }) }}
            </li>
          </ul>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-if="delivery.stopId"
            size="sm"
            color="neutral"
            variant="soft"
            :loading="isManifestActing(delivery) && manifestLoading"
            :disabled="manifestLoading || !delivery.stopId"
            :aria-label="t('deliveryManifest.downloadStopAria')"
            data-testid="apotheker-download-stop-manifest"
            @click="onDownloadStopManifest(delivery)"
          >
            {{
              isManifestActing(delivery) && manifestLoading
                ? t('deliveryManifest.generating')
                : t('deliveryManifest.downloadStop')
            }}
          </UButton>

          <UButton
            v-if="canShowQr(delivery)"
            size="sm"
            color="primary"
            :aria-label="t('deliveryStopQr.planned.showQrAria')"
            data-testid="show-delivery-qr"
            @click="onShowQr(delivery, $event)"
          >
            {{ t('deliveryStopQr.planned.showQr') }}
          </UButton>

          <p
            v-else-if="delivery.qrConsumed"
            class="text-sm text-muted"
            data-testid="planned-delivery-confirmed"
          >
            {{ t('deliveryStopQr.state.confirmed') }}
          </p>

          <p
            v-else
            class="text-sm text-muted"
            data-testid="planned-delivery-unavailable"
          >
            {{ t('deliveryStopQr.state.unavailable') }}
          </p>
        </div>

        <UAlert
          v-if="isManifestFeedback(delivery) && manifestError"
          color="error"
          variant="subtle"
          :title="manifestError"
          data-testid="apotheker-manifest-error"
        />
        <UAlert
          v-else-if="isManifestFeedback(delivery) && manifestSuccess"
          color="success"
          variant="subtle"
          :title="manifestSuccess"
          data-testid="apotheker-manifest-success"
        />
      </li>
    </ul>

    <FeatureDeliveryStopQrModal
      :open="open"
      :context="context"
      :object-url="objectUrl"
      :loading="qrLoading"
      :error-message="qrError"
      :inactive-message="inactiveMessage"
      :can-download="canDownload"
      :download-filename="downloadFilename"
      @update:open="value => !value && closeModal()"
      @close="closeModal"
      @retry="retry"
      @download="downloadQr"
    />
  </section>
</template>
