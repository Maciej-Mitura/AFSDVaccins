<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import FeatureBezorgerDeliveryQrWorkflow from '@/components/feature/bezorger/FeatureBezorgerDeliveryQrWorkflow.vue'
import FeatureBezorgerStopArrivalPanel from '@/components/feature/bezorger/FeatureBezorgerStopArrivalPanel.vue'
import FeatureRouteLocationStatusCard from '@/components/feature/routes/FeatureRouteLocationStatusCard.vue'
import FeatureRouteVoiceRecorder from '@/components/feature/voice-report/FeatureRouteVoiceRecorder.vue'
import { toRouteLocationStatusCardProps } from '@/components/feature/routes/route-location-status'
import { useCourierStopArrival } from '@/composables/useCourierStopArrival'
import {
  deriveStopLifecycleStatus,
  evaluateRouteCompletionEligibility,
  isStopArrived,
  isStopDeliveryConfirmed,
  listIncompleteDeliverableStops,
  type DerivedStopLifecycleStatus,
} from '@/composables/delivery-stop-lifecycle'
import {
  RouteStatus,
  useDeliveryRoutes,
  type DeliveryStopItem,
} from '@/composables/useDeliveryRoutes'
import { useDeliveryManifestDownload } from '@/composables/useDeliveryManifestDownload'
import { useRealtimeConnection } from '@/composables/useRealtimeConnection'
import { formatDateTime, routeStatusLabel, translatePlural } from '@/i18n'
import { UserRole } from '@vaccin-delivery/types'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { registerReconnectHandler } from '@/composables/useGraphQL'

const { t } = useI18n()
const { currentUser, initialized } = useCurrentUser()
const {
  myTodayRoute,
  loading,
  refreshing,
  updatingStatus,
  errorMessage,
  statusError,
  todayRouteSource,
  todayRouteCachedAt,
  todayRouteRefreshError,
  todayRouteIsReadOnly,
  isOnline,
  loadMyTodayRoute,
  updateRouteStatus,
  subscribeToTodayRouteUpdates,
  stopTodayRouteSubscription,
  formatAddress,
  formatStatusHistoryEntry,
} = useDeliveryRoutes()

const { connectionState } = useRealtimeConnection()

const {
  loading: manifestLoading,
  errorMessage: manifestError,
  successMessage: manifestSuccess,
  downloadRouteManifest,
} = useDeliveryManifestDownload()

async function onDownloadRouteManifest(): Promise<void> {
  const route = myTodayRoute.value
  if (!route) {
    return
  }
  await downloadRouteManifest(route.id, route.deliveryDate)
}

const confirmStart = ref(false)
const confirmComplete = ref(false)
const confirmCancelArrivalStopId = ref<string | null>(null)
const expandedStopKeys = ref<Set<string>>(new Set())

const ownerUserId = computed(() => currentUser.value?.id ?? null)
const ownerBezorgerProfileId = computed(
  () => currentUser.value?.bezorgerProfile?.id ?? null,
)

const {
  viewModelForStop,
  feedbackMessage,
  feedbackTone,
  reloadPendingActions,
  markArrived,
  cancelPending,
  discardPending,
  retrySync,
  syncOnReconnect,
} = useCourierStopArrival({
  route: myTodayRoute,
  routeSource: todayRouteSource,
  isOnline,
  ownerUserId,
  ownerBezorgerProfileId,
  refreshAuthoritativeRoute: () => loadMyTodayRoute({ isRefresh: true }),
})

const canScanDeliveryQr = computed(() => {
  return (
    currentUser.value?.role === UserRole.Bezorger &&
    myTodayRoute.value?.status === RouteStatus.InProgress
  )
})

const actionsEnabled = computed(
  () => !todayRouteIsReadOnly.value && isOnline.value && !updatingStatus.value,
)

const arrivalFeedbackText = computed(() => {
  const key = feedbackMessage.value
  if (!key) {
    return null
  }
  if (key.startsWith('arrival.') || key.startsWith('errors.')) {
    return t(key)
  }
  return key
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

const cachedAtLabel = computed(() => {
  if (!todayRouteCachedAt.value) {
    return null
  }
  return t('offline.lastUpdated', {
    dateTime: formatDateTime(todayRouteCachedAt.value),
  })
})

const routeStatusColor = computed(() => {
  const status = myTodayRoute.value?.status
  if (status === RouteStatus.InProgress) {
    return 'primary'
  }
  if (status === RouteStatus.Completed) {
    return 'success'
  }
  if (status === RouteStatus.Cancelled) {
    return 'error'
  }
  if (status === RouteStatus.Assigned) {
    return 'warning'
  }
  return 'neutral'
})

const headerMeta = computed(() => {
  if (!myTodayRoute.value) {
    return undefined
  }
  return t('bezorger.route.date', { date: myTodayRoute.value.deliveryDate })
})

function isStopDelivered(stop: DeliveryStopItem): boolean {
  return isStopDeliveryConfirmed(stop)
}

function stopLifecycleStatus(stop: DeliveryStopItem): DerivedStopLifecycleStatus {
  return deriveStopLifecycleStatus(stop)
}

function stopLifecycleLabel(stop: DeliveryStopItem): string {
  const status = stopLifecycleStatus(stop)
  if (status === 'delivery_confirmed') {
    return t('bezorger.route.stop.lifecycle.confirmed')
  }
  if (status === 'arrived') {
    return t('bezorger.route.stop.lifecycle.arrived')
  }
  return t('bezorger.route.stop.lifecycle.pending')
}

function stopKey(stop: DeliveryStopItem): string {
  return stop.stopId ?? `${stop.apothekerProfileId}-${stop.sequence}`
}

const currentStop = computed((): DeliveryStopItem | null => {
  const route = myTodayRoute.value
  if (!route || route.stops.length === 0) {
    return null
  }
  if (
    route.status === RouteStatus.Completed ||
    route.status === RouteStatus.Cancelled
  ) {
    return null
  }
  return route.stops.find(stop => !isStopDelivered(stop)) ?? null
})

const incompleteStops = computed(() => {
  const route = myTodayRoute.value
  if (!route) {
    return []
  }
  return listIncompleteDeliverableStops(route.stops)
})

const completionEligibility = computed(() => {
  const route = myTodayRoute.value
  if (!route) {
    return { ok: true, incompleteStopCount: 0 }
  }
  return evaluateRouteCompletionEligibility(route.stops)
})

const canCompleteRoute = computed(
  () =>
    actionsEnabled.value &&
    myTodayRoute.value?.status === RouteStatus.InProgress &&
    completionEligibility.value.ok,
)

const incompleteStopsLabel = computed(() => {
  const count = completionEligibility.value.incompleteStopCount
  if (count <= 0) {
    return null
  }
  return translatePlural('bezorger.route.complete.incompleteStops', count)
})

const currentStopArrived = computed(() => {
  const stop = currentStop.value
  if (!stop || isStopDelivered(stop)) {
    return false
  }
  const stopId = stop.stopId
  if (stopId) {
    const vm = viewModelForStop(stopId)
    if (
      vm?.state === 'confirmed' ||
      vm?.state === 'pending' ||
      vm?.state === 'syncing'
    ) {
      return true
    }
  }
  return isStopArrived(stop)
})

const showDominantQrForCurrentStop = computed(() => {
  return (
    myTodayRoute.value?.status === RouteStatus.InProgress &&
    currentStop.value != null &&
    !isStopDelivered(currentStop.value) &&
    currentStopArrived.value
  )
})

const showEarlyQrSection = computed(() => {
  return (
    myTodayRoute.value?.status === RouteStatus.InProgress &&
    !showDominantQrForCurrentStop.value &&
    !(
      currentStop.value &&
      isStopDelivered(currentStop.value) &&
      incompleteStops.value.length === 0
    )
  )
})

const remainingStops = computed((): DeliveryStopItem[] => {
  const route = myTodayRoute.value
  if (!route) {
    return []
  }
  const currentKey = currentStop.value ? stopKey(currentStop.value) : null
  return route.stops.filter(stop => stopKey(stop) !== currentKey)
})

function stopTotalLabel(totalQuantity: number): string {
  const doses = translatePlural('routes.stop.doses', totalQuantity)
  return t('bezorger.route.stop.total', { doses })
}

function stopOrdersLabel(orderCount: number): string {
  return translatePlural('routes.stop.orders', orderCount)
}

function orderReferencesLabel(orderIds: string[]): string {
  if (orderIds.length === 0) {
    return t('offline.route.orderReferencesOmitted')
  }
  return t('offline.route.orderReferences', {
    references: orderIds.join(', '),
  })
}

function isStopExpanded(key: string): boolean {
  return expandedStopKeys.value.has(key)
}

function toggleStopDetails(key: string): void {
  const next = new Set(expandedStopKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedStopKeys.value = next
}

function stopRoleLabel(stop: DeliveryStopItem): string | null {
  if (isStopDelivered(stop)) {
    return t('bezorger.route.stop.completed')
  }
  if (currentStop.value && stopKey(stop) === stopKey(currentStop.value)) {
    return myTodayRoute.value?.status === RouteStatus.Assigned
      ? t('bezorger.route.stop.next')
      : t('bezorger.route.stop.current')
  }
  if (
    currentStop.value &&
    !isStopDelivered(stop) &&
    stop.sequence === (currentStop.value.sequence ?? 0) + 1
  ) {
    return t('bezorger.route.stop.next')
  }
  return null
}

function showArrivalForStop(stop: DeliveryStopItem): boolean {
  if (!stop.stopId) {
    return false
  }
  const vm = viewModelForStop(stop.stopId)
  return (
    myTodayRoute.value?.status === RouteStatus.InProgress ||
    vm?.state === 'confirmed' ||
    vm?.state === 'pending' ||
    vm?.state === 'syncing' ||
    vm?.state === 'failed' ||
    vm?.state === 'conflict'
  )
}

async function onStartRoute(): Promise<void> {
  if (!myTodayRoute.value || !actionsEnabled.value) {
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
  if (!myTodayRoute.value || !canCompleteRoute.value) {
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

async function onRetryRefresh(): Promise<void> {
  await loadMyTodayRoute({ isRefresh: Boolean(myTodayRoute.value) })
}

async function onMarkArrived(stopId: string): Promise<void> {
  await markArrived(stopId)
}

async function onCancelPendingArrival(stopId: string): Promise<void> {
  if (confirmCancelArrivalStopId.value !== stopId) {
    confirmCancelArrivalStopId.value = stopId
    return
  }
  const vm = viewModelForStop(stopId)
  if (vm?.pendingActionId) {
    await cancelPending(vm.pendingActionId)
  }
  confirmCancelArrivalStopId.value = null
}

function dismissCancelArrivalConfirm(): void {
  confirmCancelArrivalStopId.value = null
}

async function onDiscardPending(stopId: string): Promise<void> {
  const vm = viewModelForStop(stopId)
  if (vm?.pendingActionId) {
    await discardPending(vm.pendingActionId)
  }
}

let arrivalReconnectCleanup: (() => void) | null = null

onMounted(() => {
  void loadMyTodayRoute()
  subscribeToTodayRouteUpdates()
  void reloadPendingActions()
  arrivalReconnectCleanup = registerReconnectHandler(() => {
    void syncOnReconnect()
  })
})

onUnmounted(() => {
  stopTodayRouteSubscription()
  arrivalReconnectCleanup?.()
})

watch([ownerUserId, ownerBezorgerProfileId, isOnline], () => {
  void reloadPendingActions()
  if (isOnline.value) {
    void syncOnReconnect()
  }
})
</script>

<template>
  <div
    class="mx-auto max-w-xl space-y-6 px-1"
    data-testid="bezorger-today-route"
  >
    <CommonPageHeader
      :title="t('bezorger.route.today.title')"
      :subtitle="t('bezorger.route.today.description')"
      :meta="headerMeta"
    >
      <template v-if="myTodayRoute" #actions>
        <UBadge variant="subtle" :color="routeStatusColor">
          {{ routeStatusLabel(myTodayRoute.status) }}
        </UBadge>
      </template>
    </CommonPageHeader>

    <p
      v-if="connectionState === 'reconnecting'"
      class="text-xs text-warning"
      role="status"
    >
      {{ t('realtime.reconnecting') }}
    </p>

    <CommonLoadingSkeleton v-if="(!initialized || loading) && !myTodayRoute" />

    <CommonErrorState
      v-else-if="errorMessage && !myTodayRoute"
      :title="t('bezorger.route.today.loadFailed')"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="initialized && !loading && !myTodayRoute"
      :title="t('bezorger.route.today.empty.title')"
      :description="
        todayRouteSource === 'NONE' && !isOnline
          ? t('offline.route.openOnlineFirst')
          : t('bezorger.route.today.empty.description')
      "
    />

    <template v-else-if="myTodayRoute">
      <!-- 1–2. Current state banner -->
      <CommonPageSection variant="inset" data-testid="route-status-banner">
        <div class="space-y-2">
          <p class="text-xs font-medium uppercase tracking-wide text-toned">
            {{ t('bezorger.route.status') }}
          </p>
          <p
            class="text-lg font-semibold text-highlighted"
            :class="{
              'text-primary': myTodayRoute.status === RouteStatus.InProgress,
              'text-success': myTodayRoute.status === RouteStatus.Completed,
              'text-error': myTodayRoute.status === RouteStatus.Cancelled,
              'text-warning': myTodayRoute.status === RouteStatus.Assigned,
            }"
            data-testid="route-status"
          >
            {{ routeStatusLabel(myTodayRoute.status) }}
          </p>
          <p class="text-sm text-muted">
            {{ t('bezorger.route.date', { date: myTodayRoute.deliveryDate }) }}
          </p>
          <p
            v-if="
              myTodayRoute.status === RouteStatus.Cancelled &&
              latestCancelReason
            "
            class="text-sm text-toned"
          >
            {{
              t('bezorger.route.cancelReason', { reason: latestCancelReason })
            }}
          </p>
          <p
            v-else-if="myTodayRoute.status === RouteStatus.Completed"
            class="text-sm text-muted"
          >
            {{ t('bezorger.route.today.completedNote') }}
          </p>
        </div>
      </CommonPageSection>

      <!-- Sync / offline coherent status area -->
      <CommonPageSection
        v-if="
          todayRouteIsReadOnly ||
          cachedAtLabel ||
          refreshing ||
          todayRouteRefreshError ||
          arrivalFeedbackText ||
          !isOnline
        "
        :title="t('bezorger.route.sync.title')"
        data-testid="route-sync-section"
      >
        <div class="space-y-3">
          <UAlert
            v-if="todayRouteIsReadOnly"
            color="warning"
            variant="subtle"
            icon="i-lucide-wifi-off"
            role="status"
            data-testid="offline-route-banner"
            :title="t('offline.copy.title')"
            :description="t('offline.copy.description')"
          />

          <p
            v-if="cachedAtLabel"
            class="text-sm text-muted"
            data-testid="offline-route-cached-at"
          >
            {{ cachedAtLabel }}
          </p>

          <p
            v-if="refreshing"
            class="text-sm text-muted"
            role="status"
            aria-live="polite"
            data-testid="offline-route-refreshing"
          >
            {{ t('offline.route.refreshing') }}
          </p>

          <UAlert
            v-if="todayRouteRefreshError"
            color="warning"
            variant="subtle"
            role="status"
            data-testid="offline-route-refresh-error"
            :title="todayRouteRefreshError"
          >
            <template #actions>
              <UButton
                size="xs"
                variant="soft"
                data-testid="offline-route-retry"
                :loading="refreshing"
                @click="onRetryRefresh"
              >
                {{ t('common.retry') }}
              </UButton>
            </template>
          </UAlert>

          <UAlert
            v-if="arrivalFeedbackText"
            :color="
              feedbackTone === 'success'
                ? 'success'
                : feedbackTone === 'error'
                  ? 'error'
                  : 'warning'
            "
            variant="subtle"
            role="status"
            aria-live="polite"
            data-testid="arrival-feedback"
            :title="arrivalFeedbackText"
          />
        </div>
      </CommonPageSection>

      <!-- 3. Dominant primary action -->
      <div
        v-if="
          myTodayRoute.status === RouteStatus.Assigned ||
          myTodayRoute.status === RouteStatus.InProgress
        "
        class="space-y-3"
      >
        <p
          v-if="todayRouteIsReadOnly"
          class="text-sm text-muted"
          role="status"
          data-testid="offline-actions-disabled-reason"
        >
          {{ t('offline.action.requiresConnection') }}
        </p>

        <UAlert
          v-if="confirmStart && actionsEnabled"
          color="warning"
          variant="subtle"
          :title="t('bezorger.route.start.title')"
          :description="t('bezorger.route.start.description')"
        />

        <UButton
          v-if="myTodayRoute.status === RouteStatus.Assigned"
          block
          size="xl"
          class="min-h-14 text-base"
          color="primary"
          data-testid="route-start"
          :loading="updatingStatus"
          :disabled="!actionsEnabled"
          :aria-disabled="!actionsEnabled"
          :title="
            todayRouteIsReadOnly
              ? t('offline.action.requiresConnection')
              : undefined
          "
          @click="onStartRoute"
        >
          {{
            confirmStart && actionsEnabled
              ? t('bezorger.route.start.confirm')
              : t('bezorger.route.start')
          }}
        </UButton>
        <UButton
          v-if="confirmStart && actionsEnabled"
          block
          size="lg"
          class="min-h-12"
          variant="ghost"
          :disabled="updatingStatus"
          @click="cancelStartConfirm"
        >
          {{ t('common.cancel') }}
        </UButton>
      </div>

      <CommonErrorState
        v-if="statusError"
        :title="t('routes.status.changeFailed')"
        :description="statusError"
      />

      <!-- 4. Current / next stop -->
      <CommonPageSection
        v-if="currentStop"
        :title="
          myTodayRoute.status === RouteStatus.Assigned
            ? t('bezorger.route.stop.next')
            : t('bezorger.route.stop.current')
        "
        data-testid="route-current-stop-section"
      >
        <div
          class="rounded-md bg-muted px-4 py-4 space-y-3"
          data-testid="route-stop"
          :data-delivered="
            currentStop.qrConsumed || Boolean(currentStop.deliveredAt)
          "
          :data-current="true"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0 space-y-1">
              <p class="text-xs font-medium uppercase tracking-wide text-toned">
                {{
                  t('bezorger.route.stop.label', {
                    sequence: currentStop.sequence,
                  })
                }}
              </p>
              <h3
                class="text-lg font-semibold text-highlighted wrap-break-word"
              >
                {{ currentStop.pharmacyName }}
              </h3>
              <p class="text-sm text-toned wrap-break-word">
                {{ currentStop.address.city }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                variant="subtle"
                :color="
                  isStopDelivered(currentStop)
                    ? 'success'
                    : currentStopArrived
                      ? 'warning'
                      : 'neutral'
                "
                data-testid="route-stop-lifecycle"
              >
                {{ stopLifecycleLabel(currentStop) }}
              </UBadge>
              <UBadge
                v-if="stopRoleLabel(currentStop)"
                variant="subtle"
                color="primary"
                data-testid="route-stop-role"
              >
                <span class="inline-flex items-center gap-1">
                  <UIcon
                    name="i-lucide-map-pin"
                    class="size-3.5"
                    aria-hidden="true"
                  />
                  {{ stopRoleLabel(currentStop) }}
                </span>
              </UBadge>
            </div>
          </div>

          <p class="text-sm text-muted wrap-break-word">
            {{ formatAddress(currentStop) }}
          </p>

          <p class="text-sm font-medium text-highlighted">
            {{ stopTotalLabel(currentStop.totalQuantity) }}
            <span class="font-normal text-muted">
              ({{ stopOrdersLabel(currentStop.orderCount) }})
            </span>
          </p>

          <p
            v-if="isStopDelivered(currentStop)"
            class="text-sm font-medium text-success"
            data-testid="route-stop-delivered"
            role="status"
          >
            {{
              currentStop.deliveredAt
                ? t('bezorger.route.stop.deliveredAt', {
                    deliveredAt: formatDateTime(currentStop.deliveredAt),
                  })
                : t('bezorger.route.stop.deliveryConfirmed')
            }}
          </p>

          <template v-else>
            <FeatureBezorgerStopArrivalPanel
              v-if="currentStop.stopId && showArrivalForStop(currentStop)"
              :view-model="viewModelForStop(currentStop.stopId)!"
              :confirm-cancel="confirmCancelArrivalStopId === currentStop.stopId"
              @mark-arrived="onMarkArrived(currentStop.stopId!)"
              @cancel-pending="onCancelPendingArrival(currentStop.stopId!)"
              @dismiss-cancel="dismissCancelArrivalConfirm"
              @retry="retrySync"
              @discard="onDiscardPending(currentStop.stopId!)"
            />

            <UAlert
              v-if="currentStopArrived"
              color="warning"
              variant="subtle"
              role="status"
              data-testid="route-stop-arrived-next-step"
              :title="t('arrival.notDeliveredYet')"
              :description="t('bezorger.route.qr.nextStepAfterArrival')"
            />

            <div
              v-if="showDominantQrForCurrentStop"
              class="space-y-2"
              data-testid="route-stop-qr-dominant"
            >
              <p class="text-sm font-medium text-highlighted">
                {{ t('bezorger.route.qr.confirmDelivery') }}
              </p>
              <FeatureBezorgerDeliveryQrWorkflow
                :enabled="canScanDeliveryQr"
                :read-only-offline="todayRouteIsReadOnly"
                :on-refresh-route="() => loadMyTodayRoute({ isRefresh: true })"
                dominant
              />
            </div>
          </template>

          <div>
            <button
              type="button"
              class="text-sm text-toned underline-offset-2 hover:underline min-h-11"
              :aria-expanded="isStopExpanded(stopKey(currentStop))"
              :aria-controls="`stop-details-${stopKey(currentStop)}`"
              data-testid="route-stop-details-toggle"
              @click="toggleStopDetails(stopKey(currentStop))"
            >
              {{ t('bezorger.route.stop.details') }}
            </button>
            <div
              v-show="isStopExpanded(stopKey(currentStop))"
              :id="`stop-details-${stopKey(currentStop)}`"
              class="mt-2 space-y-2"
            >
              <p class="text-sm text-muted" data-testid="route-stop-orders">
                {{ orderReferencesLabel(currentStop.orderIds) }}
              </p>
              <ul class="divide-y divide-default text-sm" role="list">
                <li
                  v-for="line in currentStop.lines"
                  :key="line.vaccineId"
                  class="flex justify-between gap-2 py-2"
                >
                  <span class="wrap-break-word">{{ line.vaccineName }}</span>
                  <span class="font-medium tabular-nums">{{
                    line.quantity
                  }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </CommonPageSection>

      <!-- QR available before arrival (early confirmation allowed by backend) -->
      <CommonPageSection
        v-if="showEarlyQrSection"
        :title="t('bezorger.route.qr.scan')"
        data-testid="route-qr-section"
      >
        <p class="mb-3 text-sm text-muted" data-testid="route-qr-early-hint">
          {{ t('bezorger.route.qr.earlyConfirmHint') }}
        </p>
        <FeatureBezorgerDeliveryQrWorkflow
          :enabled="canScanDeliveryQr"
          :read-only-offline="todayRouteIsReadOnly"
          :on-refresh-route="() => loadMyTodayRoute({ isRefresh: true })"
        />
      </CommonPageSection>

      <!-- 5. Remaining stops -->
      <CommonPageSection
        v-if="remainingStops.length > 0"
        :title="t('bezorger.route.stop.remaining')"
        data-testid="route-remaining-stops"
      >
        <ol class="divide-y divide-default" role="list">
          <li
            v-for="stop in remainingStops"
            :key="stopKey(stop)"
            class="py-4 space-y-2"
            data-testid="route-stop"
            :data-delivered="stop.qrConsumed || Boolean(stop.deliveredAt)"
            :class="isStopDelivered(stop) ? 'opacity-70' : undefined"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0 space-y-0.5">
                <p
                  class="text-xs font-medium uppercase tracking-wide text-toned"
                >
                  {{
                    t('bezorger.route.stop.label', { sequence: stop.sequence })
                  }}
                </p>
                <h3
                  class="text-base font-semibold wrap-break-word"
                  :class="
                    isStopDelivered(stop) ? 'text-muted' : 'text-highlighted'
                  "
                >
                  {{ stop.pharmacyName }}
                </h3>
                <p class="text-sm text-toned wrap-break-word">
                  {{ stop.address.city }}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  variant="subtle"
                  :color="
                    isStopDelivered(stop)
                      ? 'success'
                      : isStopArrived(stop)
                        ? 'warning'
                        : 'neutral'
                  "
                  data-testid="route-stop-lifecycle"
                >
                  {{ stopLifecycleLabel(stop) }}
                </UBadge>
                <span
                  v-if="stopRoleLabel(stop)"
                  class="inline-flex items-center gap-1 text-xs font-medium text-toned"
                  data-testid="route-stop-role"
                >
                  <UIcon
                    name="i-lucide-map-pin"
                    class="size-3.5"
                    aria-hidden="true"
                  />
                  {{ stopRoleLabel(stop) }}
                </span>
                <span
                  v-if="isStopDelivered(stop)"
                  class="text-xs font-medium text-success"
                  data-testid="route-stop-delivered"
                >
                  {{
                    stop.deliveredAt
                      ? t('bezorger.route.stop.deliveredAt', {
                          deliveredAt: formatDateTime(stop.deliveredAt),
                        })
                      : t('bezorger.route.stop.deliveryConfirmed')
                  }}
                </span>
                <span
                  v-else-if="!isStopDelivered(stop)"
                  class="text-xs font-medium text-toned"
                  data-testid="route-stop-incomplete"
                >
                  {{ t('bezorger.route.stop.incomplete') }}
                </span>
              </div>
            </div>

            <p class="text-sm text-muted wrap-break-word">
              {{ formatAddress(stop) }}
            </p>

            <p class="text-sm">
              {{ stopTotalLabel(stop.totalQuantity) }}
              <span class="text-muted">
                ({{ stopOrdersLabel(stop.orderCount) }})
              </span>
            </p>

            <FeatureBezorgerStopArrivalPanel
              v-if="
                stop.stopId &&
                showArrivalForStop(stop) &&
                !isStopDelivered(stop)
              "
              :view-model="viewModelForStop(stop.stopId)!"
              :confirm-cancel="confirmCancelArrivalStopId === stop.stopId"
              @mark-arrived="onMarkArrived(stop.stopId!)"
              @cancel-pending="onCancelPendingArrival(stop.stopId!)"
              @dismiss-cancel="dismissCancelArrivalConfirm"
              @retry="retrySync"
              @discard="onDiscardPending(stop.stopId!)"
            />

            <div>
              <button
                type="button"
                class="text-sm text-toned underline-offset-2 hover:underline min-h-11"
                :aria-expanded="isStopExpanded(stopKey(stop))"
                :aria-controls="`stop-details-${stopKey(stop)}`"
                data-testid="route-stop-details-toggle"
                @click="toggleStopDetails(stopKey(stop))"
              >
                {{ t('bezorger.route.stop.details') }}
              </button>
              <div
                v-show="isStopExpanded(stopKey(stop))"
                :id="`stop-details-${stopKey(stop)}`"
                class="mt-2 space-y-2"
              >
                <p class="text-sm text-muted" data-testid="route-stop-orders">
                  {{ orderReferencesLabel(stop.orderIds) }}
                </p>
                <ul class="divide-y divide-default text-sm" role="list">
                  <li
                    v-for="line in stop.lines"
                    :key="line.vaccineId"
                    class="flex justify-between gap-2 py-2"
                  >
                    <span class="wrap-break-word">{{ line.vaccineName }}</span>
                    <span class="font-medium tabular-nums">{{
                      line.quantity
                    }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </li>
        </ol>
      </CommonPageSection>

      <CommonEmptyState
        v-if="myTodayRoute.stops.length === 0"
        :title="t('routes.stop.empty.title')"
        :description="t('bezorger.route.today.emptyStops.description')"
      />

      <!-- 7. Secondary tools: location, voice; QR already in stop context -->
      <CommonPageSection
        :title="t('bezorger.route.tools.title')"
        data-testid="route-tools-section"
      >
        <div class="grid gap-4 sm:grid-cols-2 sm:items-start">
          <FeatureRouteLocationStatusCard
            v-bind="
              toRouteLocationStatusCardProps({
                locationStatus: myTodayRoute.locationStatus,
                routeStatus: myTodayRoute.status,
                viewerRole: 'BEZORGER',
                isOfflineSnapshot: todayRouteSource === 'CACHE',
              })
            "
            variant="inset"
          />

          <FeatureRouteVoiceRecorder
            :route-id="myTodayRoute.id"
            :route-status="myTodayRoute.status"
            :route-source="todayRouteSource"
            :allow-recording="myTodayRoute.status === RouteStatus.InProgress"
            :show-courier-name="false"
            :can-retry-transcription="false"
            title-key="routeVoiceReports.voiceReport"
          />
        </div>
      </CommonPageSection>

      <!-- Complete route (end of operational flow) -->
      <div
        v-if="myTodayRoute.status === RouteStatus.InProgress"
        class="space-y-3"
      >
        <UAlert
          v-if="!completionEligibility.ok"
          color="warning"
          variant="subtle"
          role="status"
          data-testid="route-complete-blocked"
          :title="t('bezorger.route.complete.cannotComplete')"
        >
          <template #description>
            <p class="mb-2">
              {{ incompleteStopsLabel }}.
              {{ t('bezorger.route.complete.blocked') }}
            </p>
            <ul class="list-disc space-y-1 pl-4 text-sm">
              <li
                v-for="stop in incompleteStops"
                :key="stopKey(stop)"
                data-testid="route-complete-incomplete-stop"
              >
                {{
                  t('bezorger.route.stop.label', { sequence: stop.sequence })
                }}
                — {{ stop.pharmacyName }}
                ({{ stopLifecycleLabel(stop) }})
              </li>
            </ul>
          </template>
        </UAlert>

        <UAlert
          v-if="confirmComplete && canCompleteRoute"
          color="warning"
          variant="subtle"
          :title="t('bezorger.route.complete.title')"
          :description="t('bezorger.route.complete.description')"
        />

        <UButton
          block
          size="xl"
          class="min-h-14 text-base"
          color="primary"
          variant="soft"
          data-testid="route-complete"
          :loading="updatingStatus"
          :disabled="!canCompleteRoute"
          :aria-disabled="!canCompleteRoute"
          :title="
            todayRouteIsReadOnly
              ? t('offline.action.requiresConnection')
              : !completionEligibility.ok
                ? t('bezorger.route.complete.blocked')
                : undefined
          "
          @click="onCompleteRoute"
        >
          {{
            confirmComplete && canCompleteRoute
              ? t('bezorger.route.complete.confirm')
              : t('bezorger.route.complete')
          }}
        </UButton>
        <UButton
          v-if="confirmComplete && canCompleteRoute"
          block
          size="lg"
          class="min-h-12"
          variant="ghost"
          :disabled="updatingStatus"
          @click="cancelCompleteConfirm"
        >
          {{ t('common.cancel') }}
        </UButton>
      </div>

      <!-- 8. Completed / technical details -->
      <CommonPageSection
        :title="t('bezorger.route.technical.title')"
        data-testid="route-technical-section"
      >
        <div class="space-y-3">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            class="min-h-11"
            :loading="manifestLoading"
            :disabled="!isOnline || manifestLoading"
            :aria-label="t('deliveryManifest.downloadRouteAria')"
            data-testid="bezorger-download-route-manifest"
            @click="onDownloadRouteManifest"
          >
            {{
              manifestLoading
                ? t('deliveryManifest.generating')
                : t('deliveryManifest.downloadRoute')
            }}
          </UButton>
          <UAlert
            v-if="manifestError"
            color="error"
            variant="subtle"
            :title="manifestError"
            data-testid="bezorger-manifest-error"
          />
          <UAlert
            v-else-if="manifestSuccess"
            color="success"
            variant="subtle"
            :title="manifestSuccess"
            data-testid="bezorger-manifest-success"
          />

          <div
            v-if="
              todayRouteSource === 'SERVER' &&
              myTodayRoute.statusHistory.length > 0
            "
            class="space-y-2"
          >
            <p class="text-sm font-medium text-highlighted">
              {{ t('routes.statusHistory') }}
            </p>
            <ul class="divide-y divide-default text-sm text-muted">
              <li
                v-for="(entry, index) in myTodayRoute.statusHistory"
                :key="`${entry.toStatus}-${index}-${entry.changedAt}`"
                class="py-2"
              >
                {{ formatStatusHistoryEntry(entry) }}
              </li>
            </ul>
          </div>
        </div>
      </CommonPageSection>
    </template>
  </div>
</template>
