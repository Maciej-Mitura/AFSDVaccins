<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import FeatureBezorgerDeliveryQrWorkflow from '@/components/feature/bezorger/FeatureBezorgerDeliveryQrWorkflow.vue'
import FeatureRouteLocationStatusCard from '@/components/feature/routes/FeatureRouteLocationStatusCard.vue'
import FeatureRouteVoiceRecorder from '@/components/feature/voice-report/FeatureRouteVoiceRecorder.vue'
import { toRouteLocationStatusCardProps } from '@/components/feature/routes/route-location-status'
import { useCourierStopArrival } from '@/composables/useCourierStopArrival'
import { RouteStatus, useDeliveryRoutes } from '@/composables/useDeliveryRoutes'
import { useDeliveryManifestDownload } from '@/composables/useDeliveryManifestDownload'
import { useRealtimeConnection } from '@/composables/useRealtimeConnection'
import { formatDateTime, routeStatusLabel, translatePlural } from '@/i18n'
import { UserRole } from '@vaccin-delivery/types'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { mapDeliveryArrivalErrorCode } from '@/api/delivery-arrival-errors'
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

function arrivalErrorLabel(code: string | null): string {
  if (!code) {
    return t('arrival.unableToRecord')
  }
  return mapDeliveryArrivalErrorCode(code)
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
  if (!myTodayRoute.value || !actionsEnabled.value) {
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

        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
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
        </div>
        <UAlert
          v-if="manifestError"
          class="mt-2"
          color="error"
          variant="subtle"
          :title="manifestError"
          data-testid="bezorger-manifest-error"
        />
        <UAlert
          v-else-if="manifestSuccess"
          class="mt-2"
          color="success"
          variant="subtle"
          :title="manifestSuccess"
          data-testid="bezorger-manifest-success"
        />
      </div>

      <FeatureRouteLocationStatusCard
        v-bind="
          toRouteLocationStatusCardProps({
            locationStatus: myTodayRoute.locationStatus,
            routeStatus: myTodayRoute.status,
            viewerRole: 'BEZORGER',
            isOfflineSnapshot: todayRouteSource === 'CACHE',
          })
        "
      />

      <!-- Voice report in the live-route workflow (before start/QR/complete). -->
      <FeatureRouteVoiceRecorder
        :route-id="myTodayRoute.id"
        :route-status="myTodayRoute.status"
        :route-source="todayRouteSource"
        :allow-recording="myTodayRoute.status === RouteStatus.InProgress"
        :show-courier-name="false"
        :can-retry-transcription="false"
        title-key="routeVoiceReports.voiceReport"
      />

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
        <UAlert
          v-if="confirmComplete && actionsEnabled"
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
          variant="ghost"
          :disabled="updatingStatus"
          @click="cancelStartConfirm"
        >
          {{ t('common.cancel') }}
        </UButton>

        <FeatureBezorgerDeliveryQrWorkflow
          v-if="myTodayRoute.status === RouteStatus.InProgress"
          :enabled="canScanDeliveryQr"
          :read-only-offline="todayRouteIsReadOnly"
          :on-refresh-route="() => loadMyTodayRoute({ isRefresh: true })"
        />

        <UButton
          v-if="myTodayRoute.status === RouteStatus.InProgress"
          block
          size="xl"
          class="min-h-14 text-base"
          color="primary"
          data-testid="route-complete"
          :loading="updatingStatus"
          :disabled="!actionsEnabled"
          :aria-disabled="!actionsEnabled"
          :title="
            todayRouteIsReadOnly
              ? t('offline.action.requiresConnection')
              : undefined
          "
          @click="onCompleteRoute"
        >
          {{
            confirmComplete && actionsEnabled
              ? t('bezorger.route.complete.confirm')
              : t('bezorger.route.complete')
          }}
        </UButton>
        <UButton
          v-if="confirmComplete && actionsEnabled"
          block
          size="lg"
          variant="ghost"
          :disabled="updatingStatus"
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
        v-if="
          todayRouteSource === 'SERVER' && myTodayRoute.statusHistory.length > 0
        "
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

      <ol v-else class="space-y-4" role="list">
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
          <p class="mt-1 text-sm text-muted" data-testid="route-stop-orders">
            {{ orderReferencesLabel(stop.orderIds) }}
          </p>
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

          <template
            v-else-if="
              stop.stopId &&
              (myTodayRoute.status === RouteStatus.InProgress ||
                viewModelForStop(stop.stopId)?.state === 'confirmed' ||
                viewModelForStop(stop.stopId)?.state === 'pending' ||
                viewModelForStop(stop.stopId)?.state === 'syncing' ||
                viewModelForStop(stop.stopId)?.state === 'failed' ||
                viewModelForStop(stop.stopId)?.state === 'conflict')
            "
          >
            <div
              v-if="viewModelForStop(stop.stopId)"
              class="mt-3 space-y-2"
              data-testid="route-stop-arrival"
            >
              <p
                v-if="viewModelForStop(stop.stopId)?.state === 'confirmed'"
                class="text-sm font-medium"
                data-testid="route-stop-arrived"
                role="status"
              >
                {{
                  t('arrival.arrivedAt', {
                    time: formatDateTime(
                      viewModelForStop(stop.stopId)?.clientArrivedAt ??
                        viewModelForStop(stop.stopId)?.recordedAt ??
                        '',
                    ),
                  })
                }}
              </p>

              <p
                v-else-if="viewModelForStop(stop.stopId)?.state === 'syncing'"
                class="text-sm"
                role="status"
                aria-live="polite"
                data-testid="route-stop-arrival-syncing"
              >
                {{ t('arrival.synchronising') }}
                <span class="text-muted">
                  ({{
                    formatDateTime(
                      viewModelForStop(stop.stopId)?.clientArrivedAt ?? '',
                    )
                  }})
                </span>
              </p>

              <template
                v-else-if="viewModelForStop(stop.stopId)?.state === 'pending'"
              >
                <p
                  class="text-sm font-medium"
                  role="status"
                  data-testid="route-stop-arrival-pending"
                >
                  {{ t('arrival.pending') }}
                  <span class="font-normal text-muted">
                    ({{
                      formatDateTime(
                        viewModelForStop(stop.stopId)?.clientArrivedAt ?? '',
                      )
                    }})
                  </span>
                </p>
                <p class="text-xs text-muted">
                  {{ t('arrival.willSyncWhenOnline') }}
                </p>
                <UButton
                  v-if="viewModelForStop(stop.stopId)?.canCancelPending"
                  size="sm"
                  variant="ghost"
                  data-testid="route-stop-arrival-cancel"
                  @click="onCancelPendingArrival(stop.stopId!)"
                >
                  {{
                    confirmCancelArrivalStopId === stop.stopId
                      ? t('arrival.cancelPendingConfirm')
                      : t('arrival.cancelPending')
                  }}
                </UButton>
                <UButton
                  v-if="confirmCancelArrivalStopId === stop.stopId"
                  size="sm"
                  variant="ghost"
                  @click="dismissCancelArrivalConfirm"
                >
                  {{ t('common.cancel') }}
                </UButton>
              </template>

              <template
                v-else-if="
                  viewModelForStop(stop.stopId)?.state === 'failed' ||
                  viewModelForStop(stop.stopId)?.state === 'conflict'
                "
              >
                <p
                  class="text-sm"
                  role="alert"
                  data-testid="route-stop-arrival-error"
                >
                  {{
                    viewModelForStop(stop.stopId)?.state === 'conflict'
                      ? t('arrival.conflict')
                      : arrivalErrorLabel(
                          viewModelForStop(stop.stopId)?.errorCode ?? null,
                        )
                  }}
                </p>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-if="viewModelForStop(stop.stopId)?.canRetry"
                    size="sm"
                    variant="soft"
                    data-testid="route-stop-arrival-retry"
                    @click="retrySync"
                  >
                    {{ t('arrival.retrySync') }}
                  </UButton>
                  <UButton
                    v-if="viewModelForStop(stop.stopId)?.canDiscard"
                    size="sm"
                    variant="ghost"
                    data-testid="route-stop-arrival-discard"
                    @click="onDiscardPending(stop.stopId!)"
                  >
                    {{ t('arrival.discardPending') }}
                  </UButton>
                </div>
              </template>

              <UButton
                v-else-if="viewModelForStop(stop.stopId)?.canMarkArrived"
                size="md"
                block
                data-testid="route-stop-mark-arrived"
                :aria-label="t('arrival.markArrived')"
                @click="onMarkArrived(stop.stopId!)"
              >
                {{ t('arrival.markArrived') }}
              </UButton>
            </div>
          </template>

          <p class="mt-3 text-sm font-medium">
            {{ stopTotalLabel(stop.totalQuantity) }}
            <span class="font-normal text-muted">
              ({{ stopOrdersLabel(stop.orderCount) }})
            </span>
          </p>
          <ul class="mt-2 space-y-1 text-sm" role="list">
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
