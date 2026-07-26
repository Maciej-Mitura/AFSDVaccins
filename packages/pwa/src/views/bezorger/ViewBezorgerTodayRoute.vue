<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import FeatureBezorgerDeliveryQrWorkflow from '@/components/feature/bezorger/FeatureBezorgerDeliveryQrWorkflow.vue'
import { RouteStatus, useDeliveryRoutes } from '@/composables/useDeliveryRoutes'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useRealtimeConnection } from '@/composables/useRealtimeConnection'
import { formatDateTime, routeStatusLabel, translatePlural } from '@/i18n'
import { UserRole } from '@vaccin-delivery/types'
import { useCurrentUser } from '@/composables/useCurrentUser'

const { t } = useI18n()
const { currentUser } = useCurrentUser()
const {
  myTodayRoute,
  loading,
  updatingStatus,
  errorMessage,
  statusError,
  loadMyTodayRoute,
  updateRouteStatus,
  subscribeToTodayRouteUpdates,
  stopTodayRouteSubscription,
  formatAddress,
  formatStatusHistoryEntry,
} = useDeliveryRoutes()

const { connectionState } = useRealtimeConnection()
const { isOnline } = useOnlineStatus()

const confirmStart = ref(false)
const confirmComplete = ref(false)

const canScanDeliveryQr = computed(() => {
  return (
    currentUser.value?.role === UserRole.Bezorger &&
    myTodayRoute.value?.status === RouteStatus.InProgress
  )
})

const latestCancelReason = computed(() => {
  const route = myTodayRoute.value

  if (!route || route.status !== RouteStatus.Cancelled) {
    return null
  }

  const cancelEntry = [...route.statusHistory]
    .reverse()
    .find(entry => entry.toStatus === RouteStatus.Cancelled)

  return cancelEntry?.reason ?? null
})

function stopTotalLabel(totalQuantity: number): string {
  const doses = translatePlural('routes.stop.doses', totalQuantity)
  return t('bezorger.route.stop.total', { doses })
}

function stopOrdersLabel(orderCount: number): string {
  return translatePlural('routes.stop.orders', orderCount)
}

async function onStartRoute(): Promise<void> {
  if (!myTodayRoute.value) {
    return
  }

  if (!confirmStart.value) {
    confirmStart.value = true
    return
  }

  confirmStart.value = false
  await updateRouteStatus(myTodayRoute.value.id, RouteStatus.InProgress)
}

async function onCompleteRoute(): Promise<void> {
  if (!myTodayRoute.value) {
    return
  }

  if (!confirmComplete.value) {
    confirmComplete.value = true
    return
  }

  confirmComplete.value = false
  await updateRouteStatus(myTodayRoute.value.id, RouteStatus.Completed)
}

function cancelStartConfirm(): void {
  confirmStart.value = false
}

function cancelCompleteConfirm(): void {
  confirmComplete.value = false
}

onMounted(() => {
  void loadMyTodayRoute()
  subscribeToTodayRouteUpdates()
})

onUnmounted(() => {
  stopTodayRouteSubscription()
})
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 px-1">
    <div>
      <h1 class="text-2xl font-semibold">
        {{ t('bezorger.route.today.title') }}
      </h1>
      <p class="mt-1 text-sm text-muted">
        {{ t('bezorger.route.today.description') }}
      </p>
      <p
        v-if="connectionState === 'reconnecting'"
        class="mt-1 text-xs text-warning"
      >
        {{ t('realtime.reconnecting') }}
      </p>
    </div>

    <CommonLoadingSkeleton v-if="loading && !myTodayRoute" />
    <CommonErrorState
      v-else-if="errorMessage && !myTodayRoute"
      :title="t('bezorger.route.today.loadFailed')"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="!loading && !myTodayRoute"
      :title="t('bezorger.route.today.empty.title')"
      :description="t('bezorger.route.today.empty.description')"
    />

    <template v-else-if="myTodayRoute">
      <div class="rounded-lg bg-elevated/50 px-4 py-3">
        <p class="text-sm text-muted">{{ t('bezorger.route.status') }}</p>
        <p class="text-lg font-semibold" data-testid="route-status">
          {{ routeStatusLabel(myTodayRoute.status) }}
        </p>
        <p class="mt-1 text-sm text-muted">
          {{ t('bezorger.route.date', { date: myTodayRoute.deliveryDate }) }}
        </p>
        <p
          v-if="
            myTodayRoute.status === RouteStatus.Cancelled && latestCancelReason
          "
          class="mt-2 text-sm"
        >
          {{ t('bezorger.route.cancelReason', { reason: latestCancelReason }) }}
        </p>
        <p
          v-else-if="myTodayRoute.status === RouteStatus.Completed"
          class="mt-2 text-sm text-muted"
        >
          {{ t('bezorger.route.today.completedNote') }}
        </p>
      </div>

      <div
        v-if="
          myTodayRoute.status === RouteStatus.Assigned ||
          myTodayRoute.status === RouteStatus.InProgress
        "
        class="space-y-3"
      >
        <UAlert
          v-if="confirmStart"
          color="warning"
          variant="subtle"
          :title="t('bezorger.route.start.title')"
          :description="t('bezorger.route.start.description')"
        />
        <UAlert
          v-if="confirmComplete"
          color="warning"
          variant="subtle"
          :title="t('bezorger.route.complete.title')"
          :description="t('bezorger.route.complete.description')"
        />

        <UButton
          v-if="myTodayRoute.status === RouteStatus.Assigned"
          block
          size="xl"
          class="min-h-14 text-base"
          data-testid="route-start"
          :loading="updatingStatus"
          :disabled="!isOnline || updatingStatus"
          @click="onStartRoute"
        >
          {{
            confirmStart
              ? t('bezorger.route.start.confirm')
              : t('bezorger.route.start')
          }}
        </UButton>
        <UButton
          v-if="confirmStart"
          block
          size="lg"
          variant="ghost"
          :disabled="!isOnline || updatingStatus"
          @click="cancelStartConfirm"
        >
          {{ t('common.cancel') }}
        </UButton>

        <FeatureBezorgerDeliveryQrWorkflow
          v-if="myTodayRoute.status === RouteStatus.InProgress"
          :enabled="canScanDeliveryQr"
          :on-refresh-route="loadMyTodayRoute"
        />

        <UButton
          v-if="myTodayRoute.status === RouteStatus.InProgress"
          block
          size="xl"
          class="min-h-14 text-base"
          color="primary"
          data-testid="route-complete"
          :loading="updatingStatus"
          :disabled="!isOnline || updatingStatus"
          @click="onCompleteRoute"
        >
          {{
            confirmComplete
              ? t('bezorger.route.complete.confirm')
              : t('bezorger.route.complete')
          }}
        </UButton>
        <UButton
          v-if="confirmComplete"
          block
          size="lg"
          variant="ghost"
          :disabled="!isOnline || updatingStatus"
          @click="cancelCompleteConfirm"
        >
          {{ t('common.cancel') }}
        </UButton>
      </div>

      <CommonErrorState
        v-if="statusError"
        :title="t('routes.status.changeFailed')"
        :description="statusError"
      />

      <div
        v-if="myTodayRoute.statusHistory.length > 0"
        class="rounded-lg border border-default px-4 py-3"
      >
        <p class="text-sm font-medium">{{ t('routes.statusHistory') }}</p>
        <ul class="mt-2 space-y-1 text-sm text-muted">
          <li
            v-for="(entry, index) in myTodayRoute.statusHistory"
            :key="`${entry.toStatus}-${index}-${entry.changedAt}`"
          >
            {{ formatStatusHistoryEntry(entry) }}
          </li>
        </ul>
      </div>

      <CommonEmptyState
        v-if="myTodayRoute.stops.length === 0"
        :title="t('routes.stop.empty.title')"
        :description="t('bezorger.route.today.emptyStops.description')"
      />

      <ol v-else class="space-y-4">
        <li
          v-for="stop in myTodayRoute.stops"
          :key="stop.stopId ?? `${stop.apothekerProfileId}-${stop.sequence}`"
          class="rounded-lg border border-default px-4 py-4"
          data-testid="route-stop"
          :data-delivered="stop.qrConsumed || Boolean(stop.deliveredAt)"
        >
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            {{ t('bezorger.route.stop.label', { sequence: stop.sequence }) }}
          </p>
          <h2 class="mt-1 text-lg font-semibold">{{ stop.pharmacyName }}</h2>
          <p class="mt-1 text-sm">{{ formatAddress(stop) }}</p>
          <p
            v-if="stop.qrConsumed || stop.deliveredAt"
            class="mt-2 text-sm font-medium text-success"
            data-testid="route-stop-delivered"
          >
            {{
              stop.deliveredAt
                ? t('bezorger.route.stop.deliveredAt', {
                    deliveredAt: formatDateTime(stop.deliveredAt),
                  })
                : t('bezorger.route.stop.delivered')
            }}
          </p>
          <p class="mt-3 text-sm font-medium">
            {{ stopTotalLabel(stop.totalQuantity) }}
            <span class="font-normal text-muted">
              ({{ stopOrdersLabel(stop.orderCount) }})
            </span>
          </p>
          <ul class="mt-2 space-y-1 text-sm">
            <li
              v-for="line in stop.lines"
              :key="line.vaccineId"
              class="flex justify-between gap-2"
            >
              <span>{{ line.vaccineName }}</span>
              <span class="font-medium">{{ line.quantity }}</span>
            </li>
          </ul>
        </li>
      </ol>
    </template>
  </div>
</template>
