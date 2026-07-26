<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import FeatureDeliveryStopQrModal from '@/components/feature/delivery-qr/FeatureDeliveryStopQrModal.vue'
import { registerReconnectHandler } from '@/composables/useGraphQL'
import { useDeliveryStopQrDisplay } from '@/composables/useDeliveryStopQrDisplay'
import {
  useMyPlannedDeliveries,
  type PlannedDeliveryItem,
} from '@/composables/useMyPlannedDeliveries'
import {
  formatDate,
  routeStatusLabel,
  translatePlural,
} from '@/i18n'

const { t } = useI18n()

const {
  plannedDeliveries,
  loading,
  errorMessage,
  loadMyPlannedDeliveries,
} = useMyPlannedDeliveries()

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

let reconnectCleanup: (() => void) | null = null

onMounted(() => {
  void loadMyPlannedDeliveries()
  reconnectCleanup = registerReconnectHandler(async () => {
    await loadMyPlannedDeliveries()
  })
})

onUnmounted(() => {
  reconnectCleanup?.()
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
  <UCard data-testid="planned-deliveries-section">
    <template #header>
      <h2 class="text-lg font-semibold">
        {{ t('deliveryStopQr.planned.title') }}
      </h2>
    </template>

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

    <ul v-else class="space-y-4" data-testid="planned-delivery-list">
      <li
        v-for="delivery in plannedDeliveries"
        :key="`${delivery.routeId}-${delivery.stopId ?? delivery.stopSequence}`"
      >
        <UCard
          data-testid="planned-delivery-card"
          :data-route-id="delivery.routeId"
          :data-stop-id="delivery.stopId ?? ''"
        >
          <div class="space-y-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">
                {{ t('deliveryStopQr.planned.cardTitle') }}
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

            <p data-testid="planned-delivery-date">
              <span class="font-medium">{{ t('orders.deliveryDate') }}:</span>
              {{ formatDate(delivery.routeDate) }}
            </p>

            <p>
              <span class="font-medium"
                >{{ t('deliveryStopQr.planned.pharmacy') }}:</span
              >
              {{ delivery.pharmacyName }}
            </p>

            <p>
              {{
                translatePlural('routes.stop.orders', delivery.orderCount)
              }}
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
              <p class="font-medium">
                {{ t('deliveryStopQr.modal.includedOrders') }}
              </p>
              <ul class="space-y-0.5 text-muted">
                <li
                  v-for="order in delivery.orders"
                  :key="order.orderId"
                  data-testid="planned-delivery-order-ref"
                >
                  {{ t('admin.orders.orderId', { id: order.orderId }) }}
                </li>
              </ul>
            </div>

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
        </UCard>
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
  </UCard>
</template>
