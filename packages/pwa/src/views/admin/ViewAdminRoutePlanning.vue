<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import FeatureDeliveryStopQrModal from '@/components/feature/delivery-qr/FeatureDeliveryStopQrModal.vue'
import FeatureRouteLocationStatusCard from '@/components/feature/routes/FeatureRouteLocationStatusCard.vue'
import FeatureRouteVoiceRecorder from '@/components/feature/voice-report/FeatureRouteVoiceRecorder.vue'
import { toRouteLocationStatusCardProps } from '@/components/feature/routes/route-location-status'
import { routeSkipReasonLabelKey } from '@/composables/route-generation-diagnostics'
import {
  deriveStopLifecycleStatus,
  evaluateRouteCompletionEligibility,
  listIncompleteDeliverableStops,
} from '@/composables/delivery-stop-lifecycle'
import {
  RouteStatus,
  useDeliveryRoutes,
  type DeliveryRouteItem,
  type DeliveryStopItem,
  type RouteStatusValue,
} from '@/composables/useDeliveryRoutes'
import { useDeliveryStopQrDisplay } from '@/composables/useDeliveryStopQrDisplay'
import { useDeliveryManifestDownload } from '@/composables/useDeliveryManifestDownload'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useRouteTemplates } from '@/composables/useRouteTemplates'
import { formatDateTime, routeStatusLabel, translatePlural } from '@/i18n'

function todayLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const { t } = useI18n()

const {
  deliveryRoutes,
  activeTemplates,
  loading,
  templatesLoading,
  generating,
  updatingStatus,
  errorMessage,
  generateError,
  statusError,
  successMessage,
  lastGenerationDiagnostics,
  planningDiagnostics,
  loadActiveTemplates,
  loadDeliveryRoutes,
  generateDeliveryRoute,
  loadRoutePlanningDiagnostics,
  updateRouteStatus,
  formatAddress,
  formatStatusHistoryEntry,
  canRegenerateRoute,
} = useDeliveryRoutes()

const { isOnline } = useOnlineStatus()
const { loadProfileOptions, findBezorgerProfile } = useRouteTemplates()

const authoritativeStops = computed(() =>
  deliveryRoutes.value.flatMap(route =>
    route.stops.map(stop => ({
      routeId: route.id,
      stopId: stop.stopId,
      qrAvailable: stop.qrAvailable,
      qrConsumed: stop.qrConsumed,
    })),
  ),
)

const {
  open: qrModalOpen,
  context: qrContext,
  objectUrl: qrObjectUrl,
  loading: qrLoading,
  errorMessage: qrError,
  inactiveMessage: qrInactive,
  canDownload: qrCanDownload,
  downloadFilename: qrDownloadFilename,
  openDeliveryStopQr,
  closeModal: closeQrModal,
  retry: retryQr,
  downloadQr,
} = useDeliveryStopQrDisplay({ authoritativeStops })

const {
  loading: manifestLoading,
  errorMessage: manifestError,
  successMessage: manifestSuccess,
  downloadRouteManifest,
} = useDeliveryManifestDownload()

const manifestActingRouteId = ref<string | null>(null)
const manifestFeedbackRouteId = ref<string | null>(null)

async function onDownloadRouteManifest(
  route: DeliveryRouteItem,
): Promise<void> {
  manifestActingRouteId.value = route.id
  manifestFeedbackRouteId.value = route.id
  try {
    await downloadRouteManifest(route.id, route.deliveryDate)
  } finally {
    manifestActingRouteId.value = null
  }
}

function stopQrStateLabel(stop: DeliveryStopItem): string {
  if (stop.qrConsumed) {
    return t('deliveryStopQr.state.confirmed')
  }
  if (stop.qrAvailable && stop.stopId) {
    return t('deliveryStopQr.state.available')
  }
  return t('deliveryStopQr.state.unavailable')
}

function stopLifecycleLabel(stop: DeliveryStopItem): string {
  const status = deriveStopLifecycleStatus(stop)
  if (status === 'delivery_confirmed') {
    return t('routes.stop.lifecycle.confirmed')
  }
  if (status === 'arrived') {
    return t('routes.stop.lifecycle.arrived')
  }
  return t('routes.stop.lifecycle.pending')
}

function routeCompletionBlocked(route: DeliveryRouteItem): boolean {
  return (
    route.status === RouteStatus.InProgress &&
    !evaluateRouteCompletionEligibility(route.stops).ok
  )
}

function routeIncompleteStopCount(route: DeliveryRouteItem): number {
  return listIncompleteDeliverableStops(route.stops).length
}

function canViewStopQr(
  route: DeliveryRouteItem,
  stop: DeliveryStopItem,
): boolean {
  return Boolean(
    stop.stopId &&
    stop.qrAvailable &&
    !stop.qrConsumed &&
    (route.status === RouteStatus.Assigned ||
      route.status === RouteStatus.InProgress),
  )
}

async function onViewStopQr(
  route: DeliveryRouteItem,
  stop: DeliveryStopItem,
  event: MouseEvent,
): Promise<void> {
  if (!stop.stopId) {
    return
  }

  await openDeliveryStopQr(
    {
      routeId: route.id,
      stopId: stop.stopId,
      routeDate: route.deliveryDate,
      routeStatus: route.status,
      stopSequence: stop.sequence,
      pharmacyName: stop.pharmacyName,
      address: stop.address,
      orderCount: stop.orderCount,
      orders: stop.orderIds.map(orderId => ({
        orderId,
        status: 'PLANNED',
        lines: [],
      })),
      totalLineCount: stop.lines.length,
      totalQuantity: stop.totalQuantity,
      qrAvailable: Boolean(stop.qrAvailable),
      qrConsumed: Boolean(stop.qrConsumed),
    },
    event.currentTarget,
  )
}

const deliveryDate = ref(todayLocalDate())
const selectedTemplateId = ref<string | undefined>(undefined)
const confirmRegenerate = ref(false)
const confirmAction = ref<{
  routeId: string
  status: RouteStatusValue
  label: string
} | null>(null)
const cancelReason = ref('')
const actingRouteId = ref<string | null>(null)

const selectedTemplate = computed(() =>
  activeTemplates.value.find(
    template => template.id === selectedTemplateId.value,
  ),
)

const selectedCourier = computed(() => {
  const template = selectedTemplate.value

  if (!template) {
    return null
  }

  return findBezorgerProfile(template.bezorgerProfileId) ?? null
})

const existingRouteForSelection = computed(() => {
  const template = selectedTemplate.value

  if (!template) {
    return null
  }

  return (
    deliveryRoutes.value.find(
      route =>
        route.deliveryDate === deliveryDate.value &&
        route.bezorgerProfileId === template.bezorgerProfileId,
    ) ?? null
  )
})

const canGenerateSelected = computed(() => {
  const existing = existingRouteForSelection.value

  if (!existing) {
    return true
  }

  return canRegenerateRoute(existing.status)
})

const templateOptions = computed(() =>
  activeTemplates.value.map(template => {
    const courier = findBezorgerProfile(template.bezorgerProfileId)
    const courierLabel = courier?.displayName ?? template.bezorgerProfileId
    return {
      label: `${template.name} — ${courierLabel}`,
      value: template.id,
    }
  }),
)

const routesForDate = computed(() =>
  deliveryRoutes.value.filter(
    route => route.deliveryDate === deliveryDate.value,
  ),
)

const confirmModalTitle = computed(() =>
  confirmAction.value
    ? t('routes.status.confirmTitle', { action: confirmAction.value.label })
    : '',
)

const generationSummaryTone = computed(() => {
  const diagnostics = lastGenerationDiagnostics.value
  if (!diagnostics) {
    return 'success' as const
  }
  if (
    diagnostics.includedStopCount === 0 &&
    diagnostics.skippedOrderCount + diagnostics.skippedPharmacyCount > 0
  ) {
    return 'error' as const
  }
  if (
    diagnostics.skippedOrderCount > 0 ||
    diagnostics.skippedPharmacyCount > 0
  ) {
    return 'warning' as const
  }
  return 'success' as const
})

const templateMissingSkipGroup = computed(() =>
  (lastGenerationDiagnostics.value?.skipGroups ?? []).find(
    group => String(group.code) === 'PHARMACY_NOT_IN_ACTIVE_TEMPLATE',
  ),
)

const showFreshnessWarning = computed(() => {
  const diagnostics = planningDiagnostics.value
  if (!diagnostics) {
    return false
  }
  return (
    diagnostics.eligibleUnplannedOrderCount > 0 &&
    diagnostics.regenerationNeeded
  )
})

async function refresh(): Promise<void> {
  await Promise.all([
    loadActiveTemplates(),
    loadProfileOptions(),
    loadDeliveryRoutes({ deliveryDate: deliveryDate.value }),
  ])
  await loadRoutePlanningDiagnostics({
    deliveryDate: deliveryDate.value,
    routeTemplateId: selectedTemplateId.value,
  })
}

async function onGenerate(): Promise<void> {
  if (!selectedTemplateId.value || !canGenerateSelected.value) {
    return
  }

  if (existingRouteForSelection.value && !confirmRegenerate.value) {
    confirmRegenerate.value = true
    return
  }

  confirmRegenerate.value = false
  await generateDeliveryRoute(selectedTemplateId.value, deliveryDate.value)
  await loadDeliveryRoutes({ deliveryDate: deliveryDate.value })
  await loadRoutePlanningDiagnostics({
    deliveryDate: deliveryDate.value,
    routeTemplateId: selectedTemplateId.value,
  })
}

function cancelRegenerateConfirm(): void {
  confirmRegenerate.value = false
}

function requestStatusChange(
  route: DeliveryRouteItem,
  status: RouteStatusValue,
  label: string,
): void {
  confirmAction.value = { routeId: route.id, status, label }
  cancelReason.value = ''
}

function closeStatusModal(): void {
  confirmAction.value = null
  cancelReason.value = ''
}

async function confirmStatusChange(): Promise<void> {
  if (!confirmAction.value) {
    return
  }

  const { routeId, status } = confirmAction.value
  actingRouteId.value = routeId

  const reason =
    status === RouteStatus.Cancelled ? cancelReason.value.trim() || null : null

  const updated = await updateRouteStatus(routeId, status, reason)
  actingRouteId.value = null

  if (updated) {
    closeStatusModal()
    await loadDeliveryRoutes({ deliveryDate: deliveryDate.value })
  }
}

function availableAdminActions(
  status: RouteStatusValue,
): Array<{
  status: RouteStatusValue
  label: string
  color?: 'error'
  disabled?: boolean
  disabledReason?: string
}> {
  if (status === RouteStatus.Assigned) {
    return [
      { status: RouteStatus.InProgress, label: t('routes.status.start') },
      {
        status: RouteStatus.Cancelled,
        label: t('common.cancel'),
        color: 'error',
      },
    ]
  }

  if (status === RouteStatus.InProgress) {
    return [
      { status: RouteStatus.Completed, label: t('routes.status.complete') },
      {
        status: RouteStatus.Cancelled,
        label: t('common.cancel'),
        color: 'error',
      },
    ]
  }

  return []
}

function isAdminActionDisabled(
  route: DeliveryRouteItem,
  action: { status: RouteStatusValue },
): boolean {
  if (action.status !== RouteStatus.Completed) {
    return false
  }
  return routeCompletionBlocked(route)
}

function stopSummary(orderCount: number, totalQuantity: number): string {
  const orders = translatePlural('routes.stop.orders', orderCount)
  const doses = translatePlural('routes.stop.doses', totalQuantity)
  return t('routes.stop.summary', { orders, doses })
}

watch(deliveryDate, () => {
  confirmRegenerate.value = false
  void loadDeliveryRoutes({ deliveryDate: deliveryDate.value })
  void loadRoutePlanningDiagnostics({
    deliveryDate: deliveryDate.value,
    routeTemplateId: selectedTemplateId.value,
  })
})

watch(selectedTemplateId, () => {
  confirmRegenerate.value = false
  void loadRoutePlanningDiagnostics({
    deliveryDate: deliveryDate.value,
    routeTemplateId: selectedTemplateId.value,
  })
})

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="space-y-8" data-testid="admin-route-planning-page">
    <CommonPageHeader
      :title="t('routes.planning.title')"
      :subtitle="t('routes.planning.description')"
    />

    <CommonPageSection :title="t('routes.generate.title')" variant="inset">
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField :label="t('orders.deliveryDate')">
          <UInput
            v-model="deliveryDate"
            type="date"
            data-testid="admin-route-planning-date"
          />
        </UFormField>

        <UFormField :label="t('routes.template.active')">
          <USelect
            v-model="selectedTemplateId"
            :items="templateOptions"
            :placeholder="t('routes.template.placeholder')"
            :loading="templatesLoading"
            data-testid="admin-route-planning-template"
          />
        </UFormField>
      </div>

      <div
        v-if="selectedCourier"
        class="mt-4 rounded-md bg-default px-3 py-2 text-sm"
        data-testid="admin-route-planning-courier"
      >
        <span class="font-medium text-highlighted"
          >{{ t('routes.courier') }}:</span
        >
        {{ selectedCourier.displayName }}
        <span v-if="selectedCourier.vehicleLabel" class="text-muted">
          ({{ selectedCourier.vehicleLabel }})
        </span>
      </div>

      <UAlert
        v-if="existingRouteForSelection && !canGenerateSelected"
        class="mt-4"
        color="warning"
        variant="subtle"
        :title="t('routes.generate.notRegenerable.title')"
        :description="
          t('routes.generate.notRegenerable.description', {
            status: routeStatusLabel(existingRouteForSelection.status),
          })
        "
      />

      <UAlert
        v-if="
          existingRouteForSelection && canGenerateSelected && confirmRegenerate
        "
        class="mt-4"
        color="warning"
        variant="subtle"
        :title="t('routes.generate.existing.title')"
        :description="t('routes.generate.existing.description')"
      />

      <UAlert
        v-if="showFreshnessWarning"
        class="mt-4"
        color="warning"
        variant="subtle"
        data-testid="admin-route-planning-freshness"
        :title="t('routes.freshness.title')"
        :description="
          t('routes.freshness.description', {
            count: planningDiagnostics?.eligibleUnplannedOrderCount ?? 0,
            generatedAt: existingRouteForSelection
              ? formatDateTime(existingRouteForSelection.generatedAt)
              : t('routes.freshness.notGenerated'),
          })
        "
      />

      <p
        class="mt-4 text-sm text-muted"
        data-testid="admin-route-planning-snapshot-hint"
      >
        {{ t('routes.freshness.snapshotHint') }}
      </p>

      <div class="mt-4 flex flex-wrap gap-2">
        <UButton
          color="primary"
          :loading="generating"
          :disabled="
            !isOnline ||
            !selectedTemplateId ||
            generating ||
            !canGenerateSelected
          "
          data-testid="admin-route-planning-generate"
          @click="onGenerate"
        >
          {{
            existingRouteForSelection
              ? confirmRegenerate
                ? t('routes.generate.confirmRegenerate')
                : t('routes.generate.regenerate')
              : t('routes.generate.submit')
          }}
        </UButton>
        <UButton
          v-if="confirmRegenerate"
          variant="ghost"
          @click="cancelRegenerateConfirm"
        >
          {{ t('common.cancel') }}
        </UButton>
      </div>

      <UAlert
        v-if="successMessage && lastGenerationDiagnostics"
        class="mt-4"
        :color="generationSummaryTone"
        variant="subtle"
        data-testid="admin-route-planning-generation-summary"
        :title="successMessage"
        :description="
          t('routes.diagnostics.summary', {
            stops: lastGenerationDiagnostics.includedStopCount,
            orders: lastGenerationDiagnostics.includedOrderCount,
            skippedOrders: lastGenerationDiagnostics.skippedOrderCount,
            skippedPharmacies: lastGenerationDiagnostics.skippedPharmacyCount,
          })
        "
      />
      <UAlert
        v-else-if="successMessage"
        class="mt-4"
        color="success"
        variant="subtle"
        :title="successMessage"
      />

      <ul
        v-if="
          lastGenerationDiagnostics &&
          lastGenerationDiagnostics.skipGroups.length > 0
        "
        class="mt-3 space-y-2 text-sm"
        data-testid="admin-route-planning-skip-groups"
      >
        <li
          v-for="group in lastGenerationDiagnostics.skipGroups"
          :key="group.code"
          class="rounded-md bg-default px-3 py-2"
        >
          <p class="font-medium text-highlighted">
            {{ t(routeSkipReasonLabelKey(group.code), { count: group.count }) }}
          </p>
          <p v-if="group.pharmacyNames.length > 0" class="text-muted">
            {{ group.pharmacyNames.join(', ') }}
          </p>
        </li>
      </ul>

      <div
        v-if="templateMissingSkipGroup"
        class="mt-3"
        data-testid="admin-route-planning-template-link"
      >
        <a
          href="/admin/route-templates"
          class="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          {{ t('routes.diagnostics.openTemplates') }}
        </a>
      </div>

      <CommonErrorState
        v-if="generateError"
        class="mt-4"
        :title="t('routes.generate.failed')"
        :description="generateError"
      />
    </CommonPageSection>

    <CommonPageSection
      :title="t('routes.generatedList.title', { date: deliveryDate })"
    >
      <CommonLoadingSkeleton v-if="loading" />
      <CommonErrorState
        v-else-if="errorMessage"
        :title="t('routes.loadFailed')"
        :description="errorMessage"
      />
      <CommonEmptyState
        v-else-if="routesForDate.length === 0"
        :title="t('routes.planning.empty.title')"
        :description="t('routes.planning.empty.description')"
      />

      <ul v-else class="divide-y divide-default" role="list">
        <li
          v-for="route in routesForDate"
          :key="route.id"
          class="space-y-4 py-5 first:pt-0"
          :data-testid="`admin-route-item-${route.id}`"
        >
          <div
            class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div class="min-w-0 space-y-1">
              <p class="font-semibold text-highlighted">
                {{
                  findBezorgerProfile(route.bezorgerProfileId)?.displayName ??
                  route.bezorgerProfileId
                }}
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge variant="subtle" color="primary">
                  {{ routeStatusLabel(route.status) }}
                </UBadge>
                <span class="text-sm text-muted">
                  {{ formatDateTime(route.generatedAt) }}
                </span>
                <UBadge
                  v-if="route.skippedApothekerProfileIds.length > 0"
                  color="neutral"
                  variant="subtle"
                >
                  {{
                    translatePlural(
                      'routes.skippedPharmacies',
                      route.skippedApothekerProfileIds.length,
                    )
                  }}
                </UBadge>
                <UBadge
                  v-if="routeCompletionBlocked(route)"
                  color="warning"
                  variant="subtle"
                  data-testid="admin-route-completion-blocked"
                >
                  {{ t('routes.completion.blocked') }}
                  —
                  {{
                    translatePlural(
                      'routes.completion.incompleteStops',
                      routeIncompleteStopCount(route),
                    )
                  }}
                </UBadge>
              </div>
            </div>

            <div
              v-if="
                availableAdminActions(route.status).length > 0 ||
                route.stops.length > 0
              "
              class="flex flex-wrap gap-2"
            >
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                :loading="manifestActingRouteId === route.id && manifestLoading"
                :disabled="!isOnline || manifestLoading"
                :aria-label="t('deliveryManifest.downloadRouteAria')"
                data-testid="admin-download-route-manifest"
                @click="onDownloadRouteManifest(route)"
              >
                {{
                  manifestActingRouteId === route.id && manifestLoading
                    ? t('deliveryManifest.generating')
                    : t('deliveryManifest.downloadRoute')
                }}
              </UButton>
              <UButton
                v-for="action in availableAdminActions(route.status)"
                :key="`${route.id}-${action.status}`"
                size="sm"
                :color="action.color === 'error' ? 'error' : 'primary'"
                :variant="action.color === 'error' ? 'outline' : 'solid'"
                :loading="actingRouteId === route.id && updatingStatus"
                :disabled="
                  !isOnline ||
                  updatingStatus ||
                  isAdminActionDisabled(route, action)
                "
                :title="
                  isAdminActionDisabled(route, action)
                    ? t('routes.completion.completeDeliveriesFirst')
                    : undefined
                "
                :data-testid="
                  action.status === RouteStatus.Completed
                    ? 'admin-route-complete'
                    : undefined
                "
                @click="requestStatusChange(route, action.status, action.label)"
              >
                {{ action.label }}
              </UButton>
            </div>
          </div>

          <UAlert
            v-if="manifestFeedbackRouteId === route.id && manifestError"
            color="error"
            variant="subtle"
            :title="manifestError"
            data-testid="admin-manifest-error"
          />
          <UAlert
            v-else-if="manifestFeedbackRouteId === route.id && manifestSuccess"
            color="success"
            variant="subtle"
            :title="manifestSuccess"
            data-testid="admin-manifest-success"
          />

          <FeatureRouteLocationStatusCard
            v-bind="
              toRouteLocationStatusCardProps({
                locationStatus: route.locationStatus,
                routeStatus: route.status,
                viewerRole: 'ADMIN',
              })
            "
          />

          <FeatureRouteVoiceRecorder
            :route-id="route.id"
            :route-status="route.status"
            route-source="SERVER"
            :allow-recording="false"
            :show-courier-name="true"
            :can-retry-transcription="true"
            title-key="routeVoiceReports.adminTitle"
          />

          <details
            v-if="route.statusHistory.length > 0"
            class="group rounded-md bg-muted px-3 py-2 text-sm"
          >
            <summary
              class="cursor-pointer list-none font-medium text-toned outline-none marker:content-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span class="inline-flex items-center gap-2">
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-4 motion-safe:transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                {{ t('routes.statusHistory') }}
              </span>
            </summary>
            <ul class="mt-2 space-y-1 text-muted">
              <li
                v-for="(entry, index) in route.statusHistory"
                :key="`${route.id}-${entry.toStatus}-${index}`"
              >
                {{ formatStatusHistoryEntry(entry) }}
              </li>
            </ul>
          </details>

          <CommonEmptyState
            v-if="route.stops.length === 0"
            :title="t('routes.stop.empty.title')"
            :description="t('routes.stop.empty.description')"
          />

          <ul
            v-else
            class="divide-y divide-default rounded-md bg-muted px-3"
            role="list"
          >
            <li
              v-for="stop in route.stops"
              :key="`${route.id}-${stop.sequence}`"
              class="space-y-2 py-3"
              data-testid="admin-route-stop"
            >
              <p class="font-medium text-highlighted">
                {{ stop.sequence }}. {{ stop.pharmacyName }}
              </p>
              <p class="text-sm text-muted">{{ formatAddress(stop) }}</p>
              <p class="text-sm">
                {{ stopSummary(stop.orderCount, stop.totalQuantity) }}
              </p>
              <ul class="text-sm text-muted">
                <li v-for="line in stop.lines" :key="line.vaccineId">
                  {{ line.vaccineName }}: {{ line.quantity }}
                </li>
              </ul>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  variant="subtle"
                  :color="
                    deriveStopLifecycleStatus(stop) === 'delivery_confirmed'
                      ? 'success'
                      : deriveStopLifecycleStatus(stop) === 'arrived'
                        ? 'warning'
                        : 'neutral'
                  "
                  data-testid="admin-stop-lifecycle"
                >
                  {{ stopLifecycleLabel(stop) }}
                </UBadge>
                <UBadge variant="subtle" data-testid="admin-stop-qr-state">
                  {{ stopQrStateLabel(stop) }}
                </UBadge>
                <UButton
                  v-if="canViewStopQr(route, stop)"
                  size="sm"
                  color="primary"
                  variant="soft"
                  :aria-label="t('deliveryStopQr.admin.viewQrAria')"
                  data-testid="admin-view-delivery-qr"
                  @click="onViewStopQr(route, stop, $event)"
                >
                  {{ t('deliveryStopQr.admin.viewQr') }}
                </UButton>
                <span
                  v-else-if="stop.qrConsumed"
                  class="text-sm text-muted"
                  data-testid="admin-stop-qr-confirmed"
                >
                  {{ t('deliveryStopQr.state.confirmed') }}
                </span>
              </div>
            </li>
          </ul>
        </li>
      </ul>

      <FeatureDeliveryStopQrModal
        :open="qrModalOpen"
        :context="qrContext"
        :object-url="qrObjectUrl"
        :loading="qrLoading"
        :error-message="qrError"
        :inactive-message="qrInactive"
        :can-download="qrCanDownload"
        :download-filename="qrDownloadFilename"
        @update:open="value => !value && closeQrModal()"
        @close="closeQrModal"
        @retry="retryQr"
        @download="downloadQr"
      />

      <CommonErrorState
        v-if="statusError"
        class="mt-4"
        :title="t('routes.status.changeFailed')"
        :description="statusError"
      />
    </CommonPageSection>

    <UModal
      :open="confirmAction !== null"
      :title="confirmModalTitle"
      @update:open="
        open => {
          if (!open) closeStatusModal()
        }
      "
    >
      <template #body>
        <p class="text-sm">
          <template v-if="confirmAction?.status === RouteStatus.Cancelled">
            {{ t('routes.status.confirmCancel') }}
          </template>
          <template
            v-else-if="confirmAction?.status === RouteStatus.InProgress"
          >
            {{ t('routes.status.confirmStart') }}
          </template>
          <template v-else>
            {{ t('routes.status.confirmComplete') }}
          </template>
        </p>
        <UFormField
          v-if="confirmAction?.status === RouteStatus.Cancelled"
          class="mt-4"
          :label="t('routes.status.reasonOptional')"
        >
          <UInput
            v-model="cancelReason"
            :placeholder="t('routes.status.reasonPlaceholder')"
          />
        </UFormField>
        <UAlert
          v-if="statusError"
          class="mt-3"
          color="error"
          variant="subtle"
          :title="statusError"
        />
      </template>
      <template #footer>
        <UButton variant="ghost" @click="closeStatusModal">
          {{ t('common.back') }}
        </UButton>
        <UButton
          :color="
            confirmAction?.status === RouteStatus.Cancelled
              ? 'error'
              : 'primary'
          "
          :loading="updatingStatus"
          :disabled="!isOnline"
          @click="confirmStatusChange"
        >
          {{ t('common.confirm') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
