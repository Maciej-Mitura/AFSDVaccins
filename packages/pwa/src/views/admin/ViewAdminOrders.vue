<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { OrderStatus } from '@vaccin-delivery/types'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonRealtimeStatus from '@/components/common/CommonRealtimeStatus.vue'
import { registerReconnectHandler } from '@/composables/useGraphQL'
import { useAdminOperationsFeed } from '@/composables/useAdminOperationsFeed'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useOrders } from '@/composables/useOrders'
import { useStock } from '@/composables/useStock'
import {
  formatDate,
  formatDateTime,
  orderStatusLabel,
  translatePlural,
} from '@/i18n'

const { t } = useI18n()
const { isOnline } = useOnlineStatus()

const {
  adminOrders,
  dailyOverview,
  ordersLoading,
  ordersError,
  statusActionLoading,
  cancelActionLoading,
  loadAdminOrders,
  loadAdminDailyOverview,
  subscribeToAdminOrderEvents,
  stopAdminOrderSubscriptions,
  updateOrderStatus,
  cancelOrderAsAdmin,
  isInvalidOrderStatusTransitionError,
  isInsufficientStockError,
  isOrderCannotBeCancelledError,
  mapGraphQLError,
} = useOrders()

const { overview: stockOverview, loadStockOverview } = useStock()
const { feedEvents, subscribeToAdminOperationsFeed, stopFeedSubscription } =
  useAdminOperationsFeed()

const filters = reactive<{
  deliveryDate: string
  isoYear?: number
  isoWeek?: number
  status?: OrderStatus
}>({
  deliveryDate: new Date().toISOString().slice(0, 10),
  isoYear: undefined,
  isoWeek: undefined,
  status: undefined,
})

const actionError = ref<string | null>(null)
const cancelActionError = ref<string | null>(null)
const actingOrderId = ref<string | null>(null)
const confirmDeliverId = ref<string | null>(null)
const confirmCancelId = ref<string | null>(null)

const adminSubscriptionCleanup = ref<(() => void) | null>(null)
let reconnectCleanup: (() => void) | null = null

const stockByVaccineId = computed(() => {
  const map = new Map<string, number>()

  for (const vaccine of stockOverview.value) {
    map.set(vaccine.id, vaccine.stockQuantity)
  }

  return map
})

const statusFilterItems = computed(() => [
  { label: t('orders.filter.allStatuses'), value: undefined },
  { label: orderStatusLabel(OrderStatus.Pending), value: OrderStatus.Pending },
  {
    label: t('status.order.planned'),
    value: OrderStatus.Planned,
  },
  {
    label: orderStatusLabel(OrderStatus.Delivered),
    value: OrderStatus.Delivered,
  },
  {
    label: orderStatusLabel(OrderStatus.Cancelled),
    value: OrderStatus.Cancelled,
  },
])

function currentFilterVariables() {
  return {
    deliveryDate: filters.deliveryDate || undefined,
    isoYear: filters.isoYear,
    isoWeek: filters.isoWeek,
    status: filters.status,
  }
}

async function refreshData() {
  await Promise.all([
    loadAdminOrders(currentFilterVariables()),
    filters.deliveryDate
      ? loadAdminDailyOverview(filters.deliveryDate)
      : Promise.resolve(),
    loadStockOverview(),
  ])
}

void refreshData()

function restartAdminSubscriptions() {
  adminSubscriptionCleanup.value?.()
  adminSubscriptionCleanup.value = subscribeToAdminOrderEvents(
    currentFilterVariables(),
  )
}

onMounted(() => {
  restartAdminSubscriptions()
  subscribeToAdminOperationsFeed()
  reconnectCleanup = registerReconnectHandler(async () => {
    await refreshData()
  })
})

onUnmounted(() => {
  adminSubscriptionCleanup.value?.()
  stopAdminOrderSubscriptions()
  stopFeedSubscription()
  reconnectCleanup?.()
})

async function applyFilters() {
  actionError.value = null
  cancelActionError.value = null
  await refreshData()
  restartAdminSubscriptions()
}

function formatStatusCounts(
  counts: Array<{ status: string; count: number }>,
): string {
  return counts
    .filter(item => item.count > 0)
    .map(item => `${orderStatusLabel(item.status)}: ${item.count}`)
    .join(', ')
}

function canMarkPlanned(status: OrderStatus): boolean {
  return status === OrderStatus.Pending
}

function canMarkDelivered(status: OrderStatus): boolean {
  return status === OrderStatus.Pending || status === OrderStatus.Planned
}

function canCancel(status: OrderStatus): boolean {
  return status === OrderStatus.Pending
}

function orderStockReady(order: (typeof adminOrders.value)[number]): boolean {
  return order.orderLines.every(line => {
    const available = stockByVaccineId.value.get(line.vaccineId) ?? 0
    return available >= line.quantity
  })
}

function handleStatusActionError(error: unknown) {
  if (isInsufficientStockError(error)) {
    actionError.value = t('errors.order.deliverInsufficientStock')
    return
  }

  if (isInvalidOrderStatusTransitionError(error)) {
    actionError.value = t('errors.order.invalidStatusTransition')
    return
  }

  actionError.value = mapGraphQLError(error)
}

function handleCancelActionError(error: unknown) {
  if (isOrderCannotBeCancelledError(error)) {
    cancelActionError.value = t('errors.order.cancelNotAllowed')
    return
  }

  cancelActionError.value = mapGraphQLError(error)
}

async function onMarkPlanned(id: string) {
  actionError.value = null
  actingOrderId.value = id

  try {
    await updateOrderStatus(id, OrderStatus.Planned)
    await refreshData()
  } catch (error: unknown) {
    handleStatusActionError(error)
  } finally {
    actingOrderId.value = null
  }
}

async function onMarkDelivered(id: string) {
  actionError.value = null
  actingOrderId.value = id

  try {
    await updateOrderStatus(id, OrderStatus.Delivered)
    confirmDeliverId.value = null
    await refreshData()
    await loadStockOverview()
  } catch (error: unknown) {
    handleStatusActionError(error)
  } finally {
    actingOrderId.value = null
  }
}

async function onCancel(id: string) {
  cancelActionError.value = null
  actingOrderId.value = id

  try {
    await cancelOrderAsAdmin(id)
    confirmCancelId.value = null
    await refreshData()
  } catch (error: unknown) {
    handleCancelActionError(error)
  } finally {
    actingOrderId.value = null
  }
}

function closeDeliverModal() {
  confirmDeliverId.value = null
  actionError.value = null
}

function closeCancelModal() {
  confirmCancelId.value = null
}

function historyEntryLabel(entry: {
  fromStatus?: string | null
  toStatus: string
  changedAt: string
}): string {
  return t('admin.orders.statusHistory.entry', {
    before: entry.fromStatus ? orderStatusLabel(entry.fromStatus) : '—',
    after: orderStatusLabel(entry.toStatus),
    date: formatDateTime(entry.changedAt),
  })
}
</script>

<template>
  <div class="space-y-6">
    <CommonRealtimeStatus />

    <UCard v-if="dailyOverview">
      <template #header>
        <h2 class="text-lg font-semibold">
          {{
            t('admin.orders.daily.title', {
              date: formatDate(dailyOverview.deliveryDate),
            })
          }}
        </h2>
      </template>

      <div class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p>
          <span class="font-medium"
            >{{ t('admin.orders.daily.activeOrders') }}:</span
          >
          {{ dailyOverview.totalOrders }}
        </p>
        <p>
          <span class="font-medium"
            >{{ t('admin.orders.daily.activeDoses') }}:</span
          >
          {{ dailyOverview.totalDoses }}
        </p>
        <p>
          <span class="font-medium"
            >{{ t('admin.orders.daily.cancelled') }}:</span
          >
          {{
            t('admin.orders.daily.cancelledDetail', {
              orders: dailyOverview.cancelledOrderCount,
              doses: dailyOverview.cancelledDoseCount,
            })
          }}
        </p>
        <p>
          <span class="font-medium"
            >{{ t('admin.orders.daily.perStatus') }}:</span
          >
          {{ formatStatusCounts(dailyOverview.statusCounts) }}
        </p>
      </div>
    </UCard>

    <UCard v-if="feedEvents.length > 0">
      <template #header>
        <h3 class="font-semibold">{{ t('admin.orders.liveOperations') }}</h3>
      </template>
      <ul class="space-y-2 text-sm">
        <li v-for="(event, index) in feedEvents.slice(0, 5)" :key="index">
          <span class="font-medium">{{ event.eventType }}</span>
          — {{ event.message }}
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('admin.orders.title') }}</h2>
      </template>

      <div class="mb-4 grid gap-3 sm:grid-cols-5">
        <UInput v-model="filters.deliveryDate" type="date" />
        <UInput
          v-model.number="filters.isoYear"
          type="number"
          :placeholder="t('orders.filter.isoYear')"
        />
        <UInput
          v-model.number="filters.isoWeek"
          type="number"
          :placeholder="t('orders.filter.isoWeek')"
        />
        <USelect
          v-model="filters.status"
          :items="statusFilterItems"
          :placeholder="t('orders.filter.status')"
        />
        <UButton @click="applyFilters">{{ t('common.filter') }}</UButton>
      </div>

      <UAlert
        v-if="actionError"
        class="mb-4"
        color="error"
        variant="subtle"
        :title="actionError"
      />

      <UAlert
        v-if="cancelActionError"
        class="mb-4"
        color="error"
        variant="subtle"
        :title="cancelActionError"
      />

      <CommonLoadingSkeleton v-if="ordersLoading && adminOrders.length === 0" />

      <CommonErrorState
        v-if="ordersError && adminOrders.length === 0"
        :title="t('admin.orders.loadFailed')"
        :description="ordersError"
      />

      <CommonEmptyState
        v-else-if="!ordersLoading && adminOrders.length === 0"
        :title="t('admin.orders.empty.title')"
        :description="t('admin.orders.empty.description')"
      />

      <div v-if="adminOrders.length > 0" class="space-y-4">
        <UCard v-for="order in adminOrders" :key="order.id">
          <div class="space-y-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">
                {{ t('admin.orders.orderId', { id: order.id }) }}
              </h3>
              <UBadge variant="subtle">{{
                orderStatusLabel(order.status)
              }}</UBadge>
              <UBadge
                v-if="canMarkDelivered(order.status)"
                :color="orderStockReady(order) ? 'success' : 'warning'"
                variant="subtle"
              >
                {{
                  orderStockReady(order)
                    ? t('admin.orders.stockOk')
                    : t('admin.orders.stockInsufficient')
                }}
              </UBadge>
            </div>
            <p>
              <span class="font-medium"
                >{{ t('admin.orders.pharmacist') }}:</span
              >
              {{ order.apotheker.firstName }} {{ order.apotheker.lastName }} ({{
                order.apotheker.email
              }})
            </p>
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
                <span class="text-muted">
                  {{
                    t('admin.orders.line.stock', {
                      stock: stockByVaccineId.get(line.vaccineId) ?? '—',
                    })
                  }}
                </span>
              </div>
            </div>

            <div v-if="order.statusHistory?.length" class="space-y-2">
              <p class="font-medium">{{ t('admin.orders.statusHistory') }}</p>
              <div
                v-for="(entry, index) in order.statusHistory"
                :key="`${order.id}-history-${index}`"
                class="rounded border border-default p-2 text-xs"
              >
                {{ historyEntryLabel(entry) }}
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="canMarkPlanned(order.status)"
                size="sm"
                variant="outline"
                :loading="
                  actingOrderId === order.id &&
                  (statusActionLoading || cancelActionLoading)
                "
                @click="onMarkPlanned(order.id)"
              >
                {{ t('admin.orders.markPlanned') }}
              </UButton>
              <UButton
                v-if="canMarkDelivered(order.status)"
                size="sm"
                color="primary"
                :loading="
                  actingOrderId === order.id &&
                  (statusActionLoading || cancelActionLoading)
                "
                @click="
                  () => {
                    confirmDeliverId = order.id
                  }
                "
              >
                {{ t('admin.orders.markDelivered') }}
              </UButton>
              <UButton
                v-if="canCancel(order.status)"
                size="sm"
                color="error"
                variant="outline"
                :loading="
                  actingOrderId === order.id &&
                  (statusActionLoading || cancelActionLoading)
                "
                @click="
                  () => {
                    confirmCancelId = order.id
                  }
                "
              >
                {{ t('common.cancel') }}
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </UCard>

    <UModal
      :open="confirmDeliverId !== null"
      :title="t('admin.orders.deliver.title')"
      @update:open="
        open => {
          if (!open) closeDeliverModal()
        }
      "
    >
      <template #body>
        <p class="text-sm">
          {{ t('admin.orders.deliver.description') }}
        </p>
        <UAlert
          v-if="actionError"
          class="mt-3"
          color="error"
          variant="subtle"
          :title="actionError"
        />
      </template>
      <template #footer>
        <UButton variant="ghost" @click="closeDeliverModal">
          {{ t('common.back') }}
        </UButton>
        <UButton
          color="primary"
          :loading="statusActionLoading"
          :disabled="!isOnline"
          @click="
            () => {
              if (confirmDeliverId) void onMarkDelivered(confirmDeliverId)
            }
          "
        >
          {{ t('admin.orders.deliver.confirm') }}
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="confirmCancelId !== null"
      :title="t('admin.orders.cancel.title')"
      @update:open="
        open => {
          if (!open) closeCancelModal()
        }
      "
    >
      <template #body>
        <p class="text-sm">
          {{ t('admin.orders.cancel.description') }}
        </p>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="closeCancelModal">
          {{ t('common.back') }}
        </UButton>
        <UButton
          color="error"
          :disabled="!isOnline"
          @click="
            () => {
              if (confirmCancelId) void onCancel(confirmCancelId)
            }
          "
        >
          {{ t('admin.orders.cancel.confirm') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
