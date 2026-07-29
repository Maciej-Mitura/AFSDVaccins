<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { NotificationType, OrderStatus } from '@vaccin-delivery/types'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import CommonRealtimeStatus from '@/components/common/CommonRealtimeStatus.vue'
import FeatureApothekerPlannedDeliveries from '@/components/feature/apotheker/FeatureApothekerPlannedDeliveries.vue'
import { shortOrderId } from '@/composables/order-history-filters'
import { registerReconnectHandler } from '@/composables/useGraphQL'
import {
  registerNotificationReceivedHandler,
  useNotifications,
  type NotificationListItem,
} from '@/composables/useNotifications'
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
const expandedOrderIds = ref<Set<string>>(new Set())
let reconnectCleanup: (() => void) | null = null
let notificationHandlerCleanup: (() => void) | null = null
let visibilityHandler: (() => void) | null = null

const ORDER_REFRESH_NOTIFICATION_TYPES = new Set<NotificationType>([
  NotificationType.ApothekerDeliveryConfirmed,
  NotificationType.ApothekerRouteStarted,
  NotificationType.ApothekerNextStop,
])

function onOrdersRelevantNotification(notification: NotificationListItem): void {
  if (!ORDER_REFRESH_NOTIFICATION_TYPES.has(notification.type)) {
    return
  }
  void loadMyOrders()
  void loadWeeklySummary()
}

void loadMyOrders()

onMounted(() => {
  subscribeToMyOrderEvents()
  subscribeToNotificationEvents()
  reconnectCleanup = registerReconnectHandler(async () => {
    await loadMyOrders()
    await loadWeeklySummary()
  })
  notificationHandlerCleanup = registerNotificationReceivedHandler(
    onOrdersRelevantNotification,
  )
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      void loadMyOrders()
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler)
})

onUnmounted(() => {
  stopMyOrderSubscriptions()
  stopNotificationSubscription()
  reconnectCleanup?.()
  notificationHandlerCleanup?.()
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
  }
})

function canCancel(status: OrderStatus): boolean {
  return status === OrderStatus.Pending
}

function isActiveOrder(status: OrderStatus): boolean {
  return status === OrderStatus.Pending || status === OrderStatus.Planned
}

function isQuietOrder(status: OrderStatus): boolean {
  return status === OrderStatus.Delivered || status === OrderStatus.Cancelled
}

const activeOrders = computed(() =>
  myOrders.value.filter(order => isActiveOrder(order.status)),
)

const completedOrders = computed(() =>
  myOrders.value.filter(order => isQuietOrder(order.status)),
)

function isExpanded(orderId: string): boolean {
  return expandedOrderIds.value.has(orderId)
}

function toggleLines(orderId: string): void {
  const next = new Set(expandedOrderIds.value)
  if (next.has(orderId)) {
    next.delete(orderId)
  } else {
    next.add(orderId)
  }
  expandedOrderIds.value = next
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
  <div class="space-y-8" data-testid="apotheker-orders">
    <CommonPageHeader
      :title="t('apotheker.orders.title')"
      :subtitle="t('apotheker.orders.subtitle')"
    >
      <template #actions>
        <UButton to="/apotheker/orders/new" size="sm" color="primary">
          {{ t('apotheker.orders.new') }}
        </UButton>
      </template>
    </CommonPageHeader>

    <CommonRealtimeStatus />

    <FeatureApothekerPlannedDeliveries />

    <CommonPageSection variant="inset">
      <p class="text-sm text-toned">
        {{ t('apotheker.orders.historyHint') }}
        <UButton
          to="/apotheker/history"
          size="xs"
          variant="link"
          color="primary"
          class="px-1"
        >
          {{ t('apotheker.dashboard.goToHistory') }}
        </UButton>
      </p>
    </CommonPageSection>

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

    <template v-else>
      <CommonPageSection
        v-if="activeOrders.length > 0"
        :title="t('apotheker.orders.section.active')"
      >
        <ul class="divide-y divide-default" role="list">
          <li
            v-for="order in activeOrders"
            :key="order.id"
            class="space-y-3 py-4 text-sm"
            data-testid="order-card"
            data-order-state="active"
          >
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold text-highlighted" :title="order.id">
                {{
                  t('orderHistory.orderId.short', {
                    id: shortOrderId(order.id),
                  })
                }}
              </h3>
              <UBadge variant="subtle" color="primary">
                {{ orderStatusLabel(order.status) }}
              </UBadge>
            </div>

            <dl class="grid gap-1.5 text-toned sm:grid-cols-2">
              <div>
                <dt class="inline font-medium text-highlighted">
                  {{ t('admin.orders.submittedAt') }}:
                </dt>
                {{ ' ' }}
                <dd class="inline">{{ formatDateTime(order.submittedAt) }}</dd>
              </div>
              <div>
                <dt class="inline font-medium text-highlighted">
                  {{ t('orders.deliveryDate') }}:
                </dt>
                {{ ' ' }}
                <dd class="inline">{{ formatDate(order.deliveryDate) }}</dd>
              </div>
              <div>
                <dt class="inline font-medium text-highlighted">
                  {{ t('orders.filter.isoWeek') }}:
                </dt>
                {{ ' ' }}
                <dd class="inline">
                  {{ order.isoWeek }} / {{ order.isoYear }}
                </dd>
              </div>
              <div>
                <dt class="inline font-medium text-highlighted">
                  {{ t('admin.orders.total') }}:
                </dt>
                {{ ' ' }}
                <dd class="inline">
                  {{
                    translatePlural(
                      'admin.orders.totalDoses',
                      order.totalQuantity,
                    )
                  }}
                </dd>
              </div>
            </dl>

            <div>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                :aria-expanded="isExpanded(order.id)"
                :aria-controls="`order-lines-${order.id}`"
                @click="toggleLines(order.id)"
              >
                {{ t('apotheker.orders.toggleLines') }}
                ({{ order.orderLines.length }})
              </UButton>
              <ul
                v-if="isExpanded(order.id)"
                :id="`order-lines-${order.id}`"
                class="mt-2 divide-y divide-default rounded-md bg-muted px-3"
                role="list"
              >
                <li
                  v-for="line in order.orderLines"
                  :key="`${order.id}-${line.vaccineId}`"
                  class="py-2 text-toned"
                >
                  {{
                    t('admin.orders.line', {
                      name: line.vaccineName,
                      count: line.quantity,
                    })
                  }}
                </li>
              </ul>
            </div>

            <UButton
              v-if="canCancel(order.status)"
              size="sm"
              color="error"
              variant="outline"
              class="min-h-11"
              :loading="cancellingId === order.id"
              :aria-label="t('common.cancel')"
              @click="onCancel(order.id)"
            >
              {{ t('common.cancel') }}
            </UButton>
          </li>
        </ul>
      </CommonPageSection>

      <CommonPageSection
        v-if="completedOrders.length > 0"
        :title="t('apotheker.orders.section.completed')"
      >
        <ul class="divide-y divide-default" role="list">
          <li
            v-for="order in completedOrders"
            :key="order.id"
            class="space-y-2 py-4 text-sm text-muted"
            data-testid="order-card"
            data-order-state="completed"
          >
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-medium" :title="order.id">
                {{
                  t('orderHistory.orderId.short', {
                    id: shortOrderId(order.id),
                  })
                }}
              </h3>
              <UBadge variant="subtle" color="neutral">
                {{ orderStatusLabel(order.status) }}
              </UBadge>
            </div>
            <p>
              {{ formatDate(order.deliveryDate) }}
              ·
              {{
                translatePlural(
                  'admin.orders.totalDoses',
                  order.totalQuantity,
                )
              }}
            </p>

            <div>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                :aria-expanded="isExpanded(order.id)"
                :aria-controls="`order-lines-${order.id}`"
                @click="toggleLines(order.id)"
              >
                {{ t('apotheker.orders.toggleLines') }}
                ({{ order.orderLines.length }})
              </UButton>
              <ul
                v-if="isExpanded(order.id)"
                :id="`order-lines-${order.id}`"
                class="mt-2 divide-y divide-default rounded-md bg-muted px-3"
                role="list"
              >
                <li
                  v-for="line in order.orderLines"
                  :key="`${order.id}-${line.vaccineId}`"
                  class="py-2"
                >
                  {{
                    t('admin.orders.line', {
                      name: line.vaccineName,
                      count: line.quantity,
                    })
                  }}
                </li>
              </ul>
            </div>
          </li>
        </ul>
      </CommonPageSection>
    </template>

    <UAlert
      v-if="actionError"
      color="error"
      variant="subtle"
      :title="actionError"
    />
  </div>
</template>
