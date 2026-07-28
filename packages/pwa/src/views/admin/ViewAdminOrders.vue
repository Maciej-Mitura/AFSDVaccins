<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { OrderStatus } from '@vaccin-delivery/types'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import CommonRealtimeStatus from '@/components/common/CommonRealtimeStatus.vue'
import { registerReconnectHandler } from '@/composables/useGraphQL'
import { useAdminOperationsFeed } from '@/composables/useAdminOperationsFeed'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useOrders } from '@/composables/useOrders'
import { useStock } from '@/composables/useStock'
import {
  formatDate,
  formatDateTime,
  operationsFeedEventTypeLabel,
  orderStatusLabel,
  translatePlural,
} from '@/i18n'
import { resolveOperationsFeedDetail } from '@/utils/operations-feed-display'

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
const expandedLines = ref<Set<string>>(new Set())
const expandedHistory = ref<Set<string>>(new Set())

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
    label: orderStatusLabel(OrderStatus.Planned),
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

const pageMeta = computed(() => {
  if (!dailyOverview.value) {
    return undefined
  }
  return t('admin.orders.daily.title', {
    date: formatDate(dailyOverview.value.deliveryDate),
  })
})

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

function isQuietStatus(status: OrderStatus): boolean {
  return status === OrderStatus.Delivered || status === OrderStatus.Cancelled
}

function statusBadgeColor(
  status: OrderStatus,
): 'success' | 'warning' | 'error' | 'neutral' | 'primary' {
  if (status === OrderStatus.Delivered) return 'success'
  if (status === OrderStatus.Cancelled) return 'neutral'
  if (status === OrderStatus.Planned) return 'primary'
  return 'warning'
}

function orderStockReady(order: (typeof adminOrders.value)[number]): boolean {
  return order.orderLines.every(line => {
    const available = stockByVaccineId.value.get(line.vaccineId) ?? 0
    return available >= line.quantity
  })
}

function isLinesExpanded(id: string): boolean {
  return expandedLines.value.has(id)
}

function isHistoryExpanded(id: string): boolean {
  return expandedHistory.value.has(id)
}

function toggleSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  return next
}

function toggleLines(id: string) {
  expandedLines.value = toggleSet(expandedLines.value, id)
}

function toggleHistory(id: string) {
  expandedHistory.value = toggleSet(expandedHistory.value, id)
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
  <div class="space-y-8" data-testid="admin-orders-page">
    <CommonPageHeader :title="t('admin.orders.title')" :meta="pageMeta" />

    <CommonRealtimeStatus />

    <CommonPageSection
      v-if="dailyOverview"
      :title="
        t('admin.orders.daily.title', {
          date: formatDate(dailyOverview.deliveryDate),
        })
      "
    >
      <div
        class="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="admin-orders-metrics"
      >
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase tracking-wide text-toned">
            {{ t('admin.orders.daily.activeOrders') }}
          </p>
          <p class="mt-1 text-2xl font-semibold tabular-nums text-highlighted">
            {{ dailyOverview.totalOrders }}
          </p>
        </div>
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase tracking-wide text-toned">
            {{ t('admin.orders.daily.activeDoses') }}
          </p>
          <p class="mt-1 text-2xl font-semibold tabular-nums text-highlighted">
            {{ dailyOverview.totalDoses }}
          </p>
        </div>
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase tracking-wide text-toned">
            {{ t('admin.orders.daily.cancelled') }}
          </p>
          <p class="mt-1 text-sm text-highlighted">
            {{
              t('admin.orders.daily.cancelledDetail', {
                orders: dailyOverview.cancelledOrderCount,
                doses: dailyOverview.cancelledDoseCount,
              })
            }}
          </p>
        </div>
        <div class="min-w-0 sm:col-span-2 lg:col-span-1">
          <p class="text-xs font-medium uppercase tracking-wide text-toned">
            {{ t('admin.orders.daily.perStatus') }}
          </p>
          <p class="mt-1 text-sm text-highlighted">
            {{
              formatStatusCounts(dailyOverview.statusCounts) ||
              t('common.emDash')
            }}
          </p>
        </div>
      </div>
    </CommonPageSection>

    <CommonPageSection
      v-if="feedEvents.length > 0"
      :title="t('admin.orders.liveOperations')"
    >
      <ul class="divide-y divide-default" role="list">
        <li
          v-for="(event, index) in feedEvents.slice(0, 5)"
          :key="index"
          class="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5 text-sm"
        >
          <span class="font-medium text-highlighted">{{
            operationsFeedEventTypeLabel(event.eventType)
          }}</span>
          <span class="text-toned">{{
            resolveOperationsFeedDetail(event, t)
          }}</span>
        </li>
      </ul>
    </CommonPageSection>

    <CommonPageSection variant="inset">
      <div
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        data-testid="admin-orders-filters"
      >
        <UInput
          v-model="filters.deliveryDate"
          type="date"
          data-testid="admin-orders-filter-date"
        />
        <UInput
          v-model.number="filters.isoYear"
          type="number"
          :placeholder="t('orders.filter.isoYear')"
          data-testid="admin-orders-filter-year"
        />
        <UInput
          v-model.number="filters.isoWeek"
          type="number"
          :placeholder="t('orders.filter.isoWeek')"
          data-testid="admin-orders-filter-week"
        />
        <USelect
          v-model="filters.status"
          :items="statusFilterItems"
          :placeholder="t('orders.filter.status')"
          data-testid="admin-orders-filter-status"
        />
        <UButton data-testid="admin-orders-filter-apply" @click="applyFilters">
          {{ t('common.filter') }}
        </UButton>
      </div>
    </CommonPageSection>

    <UAlert
      v-if="actionError"
      color="error"
      variant="subtle"
      :title="actionError"
      data-testid="admin-orders-action-error"
    />

    <UAlert
      v-if="cancelActionError"
      color="error"
      variant="subtle"
      :title="cancelActionError"
      data-testid="admin-orders-cancel-error"
    />

    <CommonLoadingSkeleton v-if="ordersLoading && adminOrders.length === 0" />

    <CommonErrorState
      v-else-if="ordersError && adminOrders.length === 0"
      :title="t('admin.orders.loadFailed')"
      :description="ordersError"
    />

    <CommonEmptyState
      v-else-if="!ordersLoading && adminOrders.length === 0"
      :title="t('admin.orders.empty.title')"
      :description="t('admin.orders.empty.description')"
    />

    <CommonPageSection v-else-if="adminOrders.length > 0">
      <!-- Desktop table -->
      <div
        class="hidden overflow-x-auto md:block"
        data-testid="admin-orders-table"
      >
        <table class="min-w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-default bg-muted">
              <th scope="col" class="px-3 py-2.5 font-medium text-toned">
                {{ t('orderHistory.column.orderId') }}
              </th>
              <th scope="col" class="px-3 py-2.5 font-medium text-toned">
                {{ t('orderHistory.column.status') }}
              </th>
              <th scope="col" class="px-3 py-2.5 font-medium text-toned">
                {{ t('admin.orders.pharmacist') }}
              </th>
              <th scope="col" class="px-3 py-2.5 font-medium text-toned">
                {{ t('orders.deliveryDate') }}
              </th>
              <th scope="col" class="px-3 py-2.5 font-medium text-toned">
                {{ t('admin.orders.total') }}
              </th>
              <th scope="col" class="px-3 py-2.5 font-medium text-toned">
                {{ t('common.actions') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <template v-for="order in adminOrders" :key="order.id">
              <tr
                :class="
                  isQuietStatus(order.status) ? 'text-toned' : 'text-default'
                "
                :data-testid="`admin-order-row-${order.id}`"
                :data-order-status="order.status"
              >
                <td class="px-3 py-3 align-top font-medium text-highlighted">
                  <span :title="order.id">{{
                    t('admin.orders.orderId', { id: order.id.slice(0, 8) })
                  }}</span>
                </td>
                <td class="px-3 py-3 align-top">
                  <UBadge
                    :color="statusBadgeColor(order.status)"
                    variant="subtle"
                    :aria-label="orderStatusLabel(order.status)"
                  >
                    {{ orderStatusLabel(order.status) }}
                  </UBadge>
                  <UBadge
                    v-if="canMarkDelivered(order.status)"
                    class="ml-1"
                    :color="orderStockReady(order) ? 'success' : 'warning'"
                    variant="subtle"
                  >
                    {{
                      orderStockReady(order)
                        ? t('admin.orders.stockOk')
                        : t('admin.orders.stockInsufficient')
                    }}
                  </UBadge>
                </td>
                <td class="px-3 py-3 align-top">
                  {{ order.apotheker.firstName }}
                  {{ order.apotheker.lastName }}
                  <span class="block text-xs text-muted">{{
                    order.apotheker.email
                  }}</span>
                </td>
                <td class="px-3 py-3 align-top tabular-nums">
                  {{ formatDate(order.deliveryDate) }}
                  <span class="block text-xs text-muted">{{
                    formatDateTime(order.submittedAt)
                  }}</span>
                </td>
                <td class="px-3 py-3 align-top tabular-nums">
                  {{
                    translatePlural(
                      'admin.orders.totalDoses',
                      order.totalQuantity,
                    )
                  }}
                </td>
                <td class="px-3 py-3 align-top">
                  <div class="flex flex-wrap gap-2">
                    <UButton
                      v-if="canMarkPlanned(order.status)"
                      size="sm"
                      variant="outline"
                      :loading="
                        actingOrderId === order.id &&
                        (statusActionLoading || cancelActionLoading)
                      "
                      data-testid="admin-order-mark-planned"
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
                      data-testid="admin-order-mark-delivered"
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
                      data-testid="admin-order-cancel"
                      @click="
                        () => {
                          confirmCancelId = order.id
                        }
                      "
                    >
                      {{ t('common.cancel') }}
                    </UButton>
                  </div>
                </td>
              </tr>
              <tr
                :class="isQuietStatus(order.status) ? 'text-toned' : undefined"
              >
                <td colspan="6" class="px-3 pb-4 pt-0">
                  <div class="flex flex-wrap gap-4 text-sm">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 font-medium text-highlighted outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary"
                      :aria-expanded="isLinesExpanded(order.id)"
                      :aria-controls="`admin-order-lines-${order.id}`"
                      data-testid="admin-order-lines-toggle"
                      @click="toggleLines(order.id)"
                    >
                      <UIcon
                        :name="
                          isLinesExpanded(order.id)
                            ? 'i-lucide-chevron-down'
                            : 'i-lucide-chevron-right'
                        "
                        class="size-4"
                        aria-hidden="true"
                      />
                      {{ t('admin.orders.lines') }}
                      <span class="font-normal text-muted"
                        >— {{ order.orderLines.length }}</span
                      >
                    </button>
                    <button
                      v-if="order.statusHistory?.length"
                      type="button"
                      class="inline-flex items-center gap-1 font-medium text-highlighted outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary"
                      :aria-expanded="isHistoryExpanded(order.id)"
                      :aria-controls="`admin-order-history-${order.id}`"
                      data-testid="admin-order-history-toggle"
                      @click="toggleHistory(order.id)"
                    >
                      <UIcon
                        :name="
                          isHistoryExpanded(order.id)
                            ? 'i-lucide-chevron-down'
                            : 'i-lucide-chevron-right'
                        "
                        class="size-4"
                        aria-hidden="true"
                      />
                      {{ t('admin.orders.statusHistory') }}
                    </button>
                  </div>

                  <ul
                    v-if="isLinesExpanded(order.id)"
                    :id="`admin-order-lines-${order.id}`"
                    class="mt-2 divide-y divide-default rounded-md bg-muted px-3"
                    data-testid="admin-order-lines"
                  >
                    <li
                      v-for="line in order.orderLines"
                      :key="`${order.id}-${line.vaccineId}`"
                      class="py-2 text-sm"
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
                    </li>
                  </ul>

                  <ul
                    v-if="
                      isHistoryExpanded(order.id) && order.statusHistory?.length
                    "
                    :id="`admin-order-history-${order.id}`"
                    class="mt-2 space-y-1 border-l border-default pl-3 text-xs text-toned"
                    data-testid="admin-order-status-history"
                  >
                    <li
                      v-for="(entry, index) in order.statusHistory"
                      :key="`${order.id}-history-${index}`"
                    >
                      {{ historyEntryLabel(entry) }}
                    </li>
                  </ul>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Mobile list -->
      <ul
        class="divide-y divide-default md:hidden"
        role="list"
        data-testid="admin-orders-cards"
      >
        <li
          v-for="order in adminOrders"
          :key="order.id"
          class="space-y-3 py-4 text-sm"
          :class="isQuietStatus(order.status) ? 'text-toned' : undefined"
          :data-testid="`admin-order-card-${order.id}`"
          :data-order-status="order.status"
        >
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-semibold text-highlighted" :title="order.id">
              {{ t('admin.orders.orderId', { id: order.id.slice(0, 8) }) }}
            </h3>
            <UBadge
              :color="statusBadgeColor(order.status)"
              variant="subtle"
              :aria-label="orderStatusLabel(order.status)"
            >
              {{ orderStatusLabel(order.status) }}
            </UBadge>
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

          <dl class="grid gap-1.5">
            <div>
              <dt class="font-medium text-toned">
                {{ t('admin.orders.pharmacist') }}
              </dt>
              <dd>
                {{ order.apotheker.firstName }} {{ order.apotheker.lastName }}
                <span class="text-muted">({{ order.apotheker.email }})</span>
              </dd>
            </div>
            <div>
              <dt class="font-medium text-toned">
                {{ t('admin.orders.submittedAt') }}
              </dt>
              <dd>{{ formatDateTime(order.submittedAt) }}</dd>
            </div>
            <div>
              <dt class="font-medium text-toned">
                {{ t('orders.deliveryDate') }}
              </dt>
              <dd>{{ formatDate(order.deliveryDate) }}</dd>
            </div>
            <div>
              <dt class="font-medium text-toned">
                {{ t('admin.orders.total') }}
              </dt>
              <dd>
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
            <button
              type="button"
              class="inline-flex items-center gap-1 font-medium text-highlighted outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary"
              :aria-expanded="isLinesExpanded(order.id)"
              :aria-controls="`admin-order-lines-m-${order.id}`"
              data-testid="admin-order-lines-toggle"
              @click="toggleLines(order.id)"
            >
              <UIcon
                :name="
                  isLinesExpanded(order.id)
                    ? 'i-lucide-chevron-down'
                    : 'i-lucide-chevron-right'
                "
                class="size-4"
                aria-hidden="true"
              />
              {{ t('admin.orders.lines') }}
            </button>
            <ul
              v-if="isLinesExpanded(order.id)"
              :id="`admin-order-lines-m-${order.id}`"
              class="mt-2 divide-y divide-default rounded-md bg-muted px-3"
              data-testid="admin-order-lines"
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
                <span class="text-muted">
                  {{
                    t('admin.orders.line.stock', {
                      stock: stockByVaccineId.get(line.vaccineId) ?? '—',
                    })
                  }}
                </span>
              </li>
            </ul>
          </div>

          <div v-if="order.statusHistory?.length">
            <button
              type="button"
              class="inline-flex items-center gap-1 font-medium text-highlighted outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary"
              :aria-expanded="isHistoryExpanded(order.id)"
              :aria-controls="`admin-order-history-m-${order.id}`"
              data-testid="admin-order-history-toggle"
              @click="toggleHistory(order.id)"
            >
              <UIcon
                :name="
                  isHistoryExpanded(order.id)
                    ? 'i-lucide-chevron-down'
                    : 'i-lucide-chevron-right'
                "
                class="size-4"
                aria-hidden="true"
              />
              {{ t('admin.orders.statusHistory') }}
            </button>
            <ul
              v-if="isHistoryExpanded(order.id)"
              :id="`admin-order-history-m-${order.id}`"
              class="mt-2 space-y-1 border-l border-default pl-3 text-xs text-toned"
              data-testid="admin-order-status-history"
            >
              <li
                v-for="(entry, index) in order.statusHistory"
                :key="`${order.id}-history-${index}`"
              >
                {{ historyEntryLabel(entry) }}
              </li>
            </ul>
          </div>

          <div class="flex flex-wrap gap-2 pt-1">
            <UButton
              v-if="canMarkPlanned(order.status)"
              size="sm"
              variant="outline"
              :loading="
                actingOrderId === order.id &&
                (statusActionLoading || cancelActionLoading)
              "
              data-testid="admin-order-mark-planned"
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
              data-testid="admin-order-mark-delivered"
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
              data-testid="admin-order-cancel"
              @click="
                () => {
                  confirmCancelId = order.id
                }
              "
            >
              {{ t('common.cancel') }}
            </UButton>
          </div>
        </li>
      </ul>
    </CommonPageSection>

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
