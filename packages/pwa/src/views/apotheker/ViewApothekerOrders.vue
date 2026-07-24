<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { OrderStatus } from '@vaccin-delivery/types'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonRealtimeStatus from '@/components/common/CommonRealtimeStatus.vue'
import { registerReconnectHandler } from '@/composables/useGraphQL'
import { useNotifications } from '@/composables/useNotifications'
import { useOrders } from '@/composables/useOrders'
import {
  formatDate,
  formatDateTime,
  mapUserFacingGraphQLError,
  orderStatusLabel,
  translatePlural,
} from '@/i18n'

const { t } = useI18n()
const {
  myOrders,
  loading,
  errorMessage,
  loadMyOrders,
  loadWeeklySummary,
  cancelOwnOrder,
  subscribeToMyOrderEvents,
  stopMyOrderSubscriptions,
  isOrderCannotBeCancelledError,
} = useOrders()

const { subscribeToNotificationEvents, stopNotificationSubscription } =
  useNotifications()

const cancellingId = ref<string | null>(null)
const actionError = ref<string | null>(null)
let reconnectCleanup: (() => void) | null = null

void loadMyOrders()

onMounted(() => {
  subscribeToMyOrderEvents()
  subscribeToNotificationEvents()
  reconnectCleanup = registerReconnectHandler(async () => {
    await loadMyOrders()
    await loadWeeklySummary()
  })
})

onUnmounted(() => {
  stopMyOrderSubscriptions()
  stopNotificationSubscription()
  reconnectCleanup?.()
})

function canCancel(status: OrderStatus): boolean {
  return status === OrderStatus.Pending
}

async function onCancel(id: string) {
  actionError.value = null
  cancellingId.value = id

  try {
    await cancelOwnOrder(id)
    await loadMyOrders()
  } catch (error: unknown) {
    actionError.value = isOrderCannotBeCancelledError(error)
      ? t('errors.order.cancelNotAllowed')
      : mapUserFacingGraphQLError(error)
  } finally {
    cancellingId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <CommonRealtimeStatus />

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">
            {{ t('apotheker.orders.title') }}
          </h2>
          <UButton to="/apotheker/orders/new" size="sm">{{
            t('apotheker.orders.new')
          }}</UButton>
        </div>
      </template>

      <CommonLoadingSkeleton v-if="loading && myOrders.length === 0" />

      <CommonErrorState
        v-else-if="errorMessage"
        :title="t('admin.orders.loadFailed')"
        :description="errorMessage"
      />

      <CommonEmptyState
        v-else-if="myOrders.length === 0"
        :title="t('admin.orders.empty.title')"
        :description="t('apotheker.orders.empty.description')"
      />

      <div v-else class="space-y-4">
        <UCard
          v-for="order in myOrders"
          :key="order.id"
          data-testid="order-card"
        >
          <div class="space-y-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">
                {{ t('admin.orders.orderId', { id: order.id }) }}
              </h3>
              <UBadge variant="subtle">{{
                orderStatusLabel(order.status)
              }}</UBadge>
            </div>
            <p>
              <span class="font-medium"
                >{{ t('admin.orders.submittedAt') }}:</span
              >
              {{ formatDateTime(order.submittedAt) }}
            </p>
            <p>
              <span class="font-medium">{{ t('orders.deliveryDate') }}:</span>
              {{ formatDate(order.deliveryDate) }}
            </p>
            <p>
              <span class="font-medium">{{ t('orders.filter.isoWeek') }}:</span>
              {{ order.isoWeek }} / {{ order.isoYear }}
            </p>
            <p>
              <span class="font-medium">{{ t('admin.orders.total') }}:</span>
              {{
                translatePlural('admin.orders.totalDoses', order.totalQuantity)
              }}
            </p>

            <div class="space-y-2">
              <p class="font-medium">{{ t('admin.orders.lines') }}</p>
              <div
                v-for="line in order.orderLines"
                :key="`${order.id}-${line.vaccineId}`"
                class="rounded border border-default p-2"
              >
                {{
                  t('admin.orders.line', {
                    name: line.vaccineName,
                    count: line.quantity,
                  })
                }}
              </div>
            </div>

            <UButton
              v-if="canCancel(order.status)"
              size="sm"
              color="error"
              variant="outline"
              :loading="cancellingId === order.id"
              @click="onCancel(order.id)"
            >
              {{ t('common.cancel') }}
            </UButton>
          </div>
        </UCard>
      </div>

      <UAlert
        v-if="actionError"
        class="mt-4"
        color="error"
        variant="subtle"
        :title="actionError"
      />
    </UCard>
  </div>
</template>
