<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import FeatureDeliveryStopQrModal from '@/components/feature/delivery-qr/FeatureDeliveryStopQrModal.vue'
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
  loadActiveTemplates,
  loadDeliveryRoutes,
  generateDeliveryRoute,
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

async function onDownloadRouteManifest(route: DeliveryRouteItem): Promise<void> {
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

async function refresh(): Promise<void> {
  await Promise.all([
    loadActiveTemplates(),
    loadProfileOptions(),
    loadDeliveryRoutes({ deliveryDate: deliveryDate.value }),
  ])
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
): Array<{ status: RouteStatusValue; label: string; color?: 'error' }> {
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

function stopSummary(orderCount: number, totalQuantity: number): string {
  const orders = translatePlural('routes.stop.orders', orderCount)
  const doses = translatePlural('routes.stop.doses', totalQuantity)
  return t('routes.stop.summary', { orders, doses })
}

watch(deliveryDate, () => {
  confirmRegenerate.value = false
  void loadDeliveryRoutes({ deliveryDate: deliveryDate.value })
})

watch(selectedTemplateId, () => {
  confirmRegenerate.value = false
})

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">{{ t('routes.planning.title') }}</h1>
      <p class="mt-1 text-sm text-muted">
        {{ t('routes.planning.description') }}
      </p>
    </div>

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('routes.generate.title') }}</h2>
      </template>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField :label="t('orders.deliveryDate')">
          <UInput v-model="deliveryDate" type="date" />
        </UFormField>

        <UFormField :label="t('routes.template.active')">
          <USelect
            v-model="selectedTemplateId"
            :items="templateOptions"
            :placeholder="t('routes.template.placeholder')"
            :loading="templatesLoading"
          />
        </UFormField>
      </div>

      <div
        v-if="selectedCourier"
        class="mt-4 rounded-md bg-elevated/50 px-3 py-2 text-sm"
      >
        <span class="font-medium">{{ t('routes.courier') }}:</span>
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

      <div class="mt-4 flex flex-wrap gap-2">
        <UButton
          :loading="generating"
          :disabled="
            !isOnline ||
            !selectedTemplateId ||
            generating ||
            !canGenerateSelected
          "
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
        v-if="successMessage"
        class="mt-4"
        color="success"
        variant="subtle"
        :title="successMessage"
      />
      <CommonErrorState
        v-if="generateError"
        class="mt-4"
        :title="t('routes.generate.failed')"
        :description="generateError"
      />
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">
          {{ t('routes.generatedList.title', { date: deliveryDate }) }}
        </h2>
      </template>

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

      <div v-else class="space-y-6">
        <div
          v-for="route in routesForDate"
          :key="route.id"
          class="space-y-3 border-b border-default pb-6 last:border-0 last:pb-0"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p class="font-medium">
                {{
                  findBezorgerProfile(route.bezorgerProfileId)?.displayName ??
                  route.bezorgerProfileId
                }}
              </p>
              <p class="text-sm text-muted">
                {{
                  t('routes.meta.statusGenerated', {
                    status: routeStatusLabel(route.status),
                    date: formatDateTime(route.generatedAt),
                  })
                }}
              </p>
            </div>
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
          </div>

          <div
            v-if="availableAdminActions(route.status).length > 0 || route.stops.length > 0"
            class="flex flex-wrap gap-2"
          >
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              :loading="
                manifestActingRouteId === route.id && manifestLoading
              "
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
              :disabled="!isOnline || updatingStatus"
              @click="requestStatusChange(route, action.status, action.label)"
            >
              {{ action.label }}
            </UButton>
          </div>

          <UAlert
            v-if="manifestFeedbackRouteId === route.id && manifestError"
            class="mt-2"
            color="error"
            variant="subtle"
            :title="manifestError"
            data-testid="admin-manifest-error"
          />
          <UAlert
            v-else-if="manifestFeedbackRouteId === route.id && manifestSuccess"
            class="mt-2"
            color="success"
            variant="subtle"
            :title="manifestSuccess"
            data-testid="admin-manifest-success"
          />

          <div
            v-if="route.statusHistory.length > 0"
            class="rounded-md bg-elevated/30 px-3 py-2 text-sm"
          >
            <p class="font-medium">{{ t('routes.statusHistory') }}</p>
            <ul class="mt-1 space-y-1 text-muted">
              <li
                v-for="(entry, index) in route.statusHistory"
                :key="`${route.id}-${entry.toStatus}-${index}`"
              >
                {{ formatStatusHistoryEntry(entry) }}
              </li>
            </ul>
          </div>

          <CommonEmptyState
            v-if="route.stops.length === 0"
            :title="t('routes.stop.empty.title')"
            :description="t('routes.stop.empty.description')"
          />

          <ul v-else class="space-y-3">
            <li
              v-for="stop in route.stops"
              :key="`${route.id}-${stop.sequence}`"
              class="rounded-md bg-elevated/40 px-3 py-3"
              data-testid="admin-route-stop"
            >
              <p class="font-medium">
                {{ stop.sequence }}. {{ stop.pharmacyName }}
              </p>
              <p class="text-sm text-muted">{{ formatAddress(stop) }}</p>
              <p class="mt-1 text-sm">
                {{ stopSummary(stop.orderCount, stop.totalQuantity) }}
              </p>
              <ul class="mt-1 text-sm text-muted">
                <li v-for="line in stop.lines" :key="line.vaccineId">
                  {{ line.vaccineName }}: {{ line.quantity }}
                </li>
              </ul>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <UBadge
                  variant="subtle"
                  data-testid="admin-stop-qr-state"
                >
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
        </div>
      </div>

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
    </UCard>

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
