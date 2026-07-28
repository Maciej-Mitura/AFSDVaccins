<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { OrderStatus, RouteStatus } from '@vaccin-delivery/types'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import { registerReconnectHandler } from '@/composables/useGraphQL'
import { useApplicationSettings } from '@/composables/useApplicationSettings'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useMyPlannedDeliveries } from '@/composables/useMyPlannedDeliveries'
import { useNotifications } from '@/composables/useNotifications'
import { useOrders } from '@/composables/useOrders'
import {
  formatDate,
  formatDateTime,
  orderStatusLabel,
  routeStatusLabel,
  translatePlural,
} from '@/i18n'
import { shortOrderId } from '@/composables/order-history-filters'

const { t } = useI18n()
const { currentUser, loading: userLoading } = useCurrentUser()

const {
  myOrders,
  weeklySummary,
  loading: ordersLoading,
  loadMyOrders,
  loadWeeklySummary,
} = useOrders()

const {
  plannedDeliveries,
  loading: deliveriesLoading,
  loadMyPlannedDeliveries,
} = useMyPlannedDeliveries()

const { unreadCount, loadUnreadCount } = useNotifications()
const { settings, loadApplicationSettings } = useApplicationSettings()

const weeklyLimit = computed(() => settings.value?.weeklyDoseCap ?? 200)

const allowanceLoading = computed(
  () => ordersLoading.value && !weeklySummary.value,
)

const recentOrders = computed(() => myOrders.value.slice(0, 5))

const upcomingDeliveries = computed(() =>
  plannedDeliveries.value
    .filter(
      delivery =>
        !delivery.qrConsumed &&
        delivery.routeStatus !== RouteStatus.Completed &&
        delivery.routeStatus !== RouteStatus.Cancelled,
    )
    .slice(0, 5),
)

const welcomeMeta = computed(() => {
  if (!currentUser.value) {
    return undefined
  }
  return `${currentUser.value.firstName} ${currentUser.value.lastName}`
})

let reconnectCleanup: (() => void) | null = null

async function refreshDashboard(): Promise<void> {
  await Promise.all([
    loadWeeklySummary(),
    loadMyOrders(),
    loadMyPlannedDeliveries(),
    loadUnreadCount(),
    loadApplicationSettings(),
  ])
}

onMounted(() => {
  void refreshDashboard()
  reconnectCleanup = registerReconnectHandler(() => refreshDashboard())
})

onUnmounted(() => {
  reconnectCleanup?.()
})

function isActiveOrder(status: OrderStatus): boolean {
  return status === OrderStatus.Pending || status === OrderStatus.Planned
}
</script>

<template>
  <div class="space-y-8" data-testid="apotheker-dashboard">
    <CommonPageHeader
      :title="t('apotheker.dashboard.title')"
      :subtitle="t('apotheker.dashboard.subtitle')"
      :meta="welcomeMeta"
    >
      <template #actions>
        <UButton
          to="/apotheker/orders/new"
          size="sm"
          color="primary"
          data-testid="dashboard-create-order"
        >
          {{ t('apotheker.dashboard.goToCreateOrder') }}
        </UButton>
        <UButton
          to="/apotheker/orders"
          size="sm"
          color="primary"
          variant="soft"
          data-testid="dashboard-my-orders"
        >
          {{ t('apotheker.dashboard.goToOrders') }}
        </UButton>
        <UButton
          to="/apotheker/history"
          size="sm"
          variant="ghost"
          color="neutral"
          data-testid="dashboard-history"
        >
          {{ t('apotheker.dashboard.goToHistory') }}
        </UButton>
      </template>
    </CommonPageHeader>

    <div data-testid="dashboard-allowance-section">
      <CommonPageSection :title="t('apotheker.dashboard.allowance.title')">
        <CommonLoadingSkeleton v-if="userLoading || allowanceLoading" />
        <div
          v-else
          class="grid gap-x-6 gap-y-3 sm:grid-cols-3"
          data-testid="dashboard-allowance-metrics"
        >
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-toned">
              {{ t('apotheker.orders.create.remaining') }}
            </p>
            <p
              class="mt-1 text-2xl font-semibold tabular-nums text-highlighted"
            >
              {{ weeklySummary?.remainingQuantity ?? weeklyLimit }}
            </p>
          </div>
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-toned">
              {{ t('apotheker.orders.create.orderedThisWeek') }}
            </p>
            <p
              class="mt-1 text-2xl font-semibold tabular-nums text-highlighted"
            >
              {{ weeklySummary?.orderedQuantity ?? 0 }}
              <span class="text-base font-normal text-muted">
                / {{ weeklySummary?.weeklyLimit ?? weeklyLimit }}
              </span>
            </p>
          </div>
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-toned">
              {{ t('apotheker.orders.create.week') }}
            </p>
            <p class="mt-1 text-sm text-highlighted">
              {{ weeklySummary?.isoWeek ?? t('common.emDash') }}
              /
              {{ weeklySummary?.isoYear ?? t('common.emDash') }}
            </p>
          </div>
        </div>
      </CommonPageSection>
    </div>

    <div data-testid="dashboard-deliveries-section">
      <CommonPageSection :title="t('apotheker.dashboard.deliveries.title')">
        <CommonLoadingSkeleton
          v-if="deliveriesLoading && upcomingDeliveries.length === 0"
        />
        <CommonEmptyState
          v-else-if="upcomingDeliveries.length === 0"
          :title="t('apotheker.dashboard.deliveries.empty')"
        />
        <ul
          v-else
          class="divide-y divide-default"
          role="list"
          data-testid="dashboard-deliveries-list"
        >
          <li
            v-for="delivery in upcomingDeliveries"
            :key="`${delivery.routeId}-${delivery.stopId ?? delivery.stopSequence}`"
            class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 text-sm"
          >
            <div class="min-w-0 space-y-0.5">
              <p class="font-medium text-highlighted">
                {{ formatDate(delivery.routeDate) }}
              </p>
              <p class="text-toned">
                {{
                  translatePlural('routes.stop.orders', delivery.orderCount)
                }}
                ·
                {{
                  translatePlural(
                    'admin.orders.totalDoses',
                    delivery.totalQuantity,
                  )
                }}
              </p>
            </div>
            <UBadge variant="subtle">
              {{ routeStatusLabel(delivery.routeStatus) }}
            </UBadge>
          </li>
        </ul>
      </CommonPageSection>
    </div>

    <div data-testid="dashboard-recent-orders-section">
      <CommonPageSection :title="t('apotheker.dashboard.recentOrders.title')">
        <template #actions>
          <UButton
            to="/apotheker/orders"
            size="xs"
            variant="ghost"
            color="neutral"
          >
            {{ t('apotheker.dashboard.goToOrders') }}
          </UButton>
        </template>

        <CommonLoadingSkeleton
          v-if="ordersLoading && recentOrders.length === 0"
        />
        <CommonEmptyState
          v-else-if="recentOrders.length === 0"
          :title="t('apotheker.dashboard.recentOrders.empty')"
        />
        <ul
          v-else
          class="divide-y divide-default"
          role="list"
          data-testid="dashboard-recent-orders-list"
        >
          <li
            v-for="order in recentOrders"
            :key="order.id"
            class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 text-sm"
            :class="
              isActiveOrder(order.status) ? 'text-highlighted' : 'text-muted'
            "
          >
            <div class="min-w-0 space-y-0.5">
              <p class="font-medium">
                {{
                  t('orderHistory.orderId.short', {
                    id: shortOrderId(order.id),
                  })
                }}
              </p>
              <p class="text-toned">
                {{ formatDate(order.deliveryDate) }}
                ·
                {{ formatDateTime(order.submittedAt) }}
              </p>
            </div>
            <UBadge
              variant="subtle"
              :color="isActiveOrder(order.status) ? 'primary' : 'neutral'"
            >
              {{ orderStatusLabel(order.status) }}
            </UBadge>
          </li>
        </ul>
      </CommonPageSection>
    </div>

    <div data-testid="dashboard-notifications-section">
      <CommonPageSection
        variant="inset"
        :title="t('apotheker.dashboard.notifications.title')"
      >
        <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p v-if="unreadCount > 0" class="font-medium text-highlighted">
            {{
              t('apotheker.dashboard.notifications.unread', {
                count: unreadCount,
              })
            }}
          </p>
          <p v-else class="text-toned">
            {{ t('apotheker.dashboard.notifications.none') }}
          </p>
          <UButton
            to="/apotheker/notifications"
            size="sm"
            variant="soft"
            color="primary"
            data-testid="dashboard-notifications-link"
          >
            {{ t('apotheker.dashboard.notifications.viewAll') }}
          </UButton>
        </div>
      </CommonPageSection>
    </div>
  </div>
</template>
