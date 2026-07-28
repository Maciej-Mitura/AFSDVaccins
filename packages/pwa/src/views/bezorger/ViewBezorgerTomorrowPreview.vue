<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import {
  useDeliveryRoutes,
  type RoutePreviewStopItem,
} from '@/composables/useDeliveryRoutes'
import { useRealtimeConnection } from '@/composables/useRealtimeConnection'
import { translatePlural } from '@/i18n'

const { t } = useI18n()

const {
  myTomorrowRoutePreview,
  previewLoading,
  previewErrorMessage,
  previewErrorCode,
  loadMyTomorrowRoutePreview,
  subscribeToTomorrowPreviewReconnect,
  stopTomorrowPreviewReconnect,
  formatAddress,
  isMissingTemplatePreviewError,
  isMultipleActiveTemplatePreviewError,
} = useDeliveryRoutes()

const { connectionState } = useRealtimeConnection()

const expandedStopKeys = ref<Set<string>>(new Set())

const missingTemplate = computed(() =>
  isMissingTemplatePreviewError(previewErrorCode.value),
)

const multipleActiveTemplates = computed(() =>
  isMultipleActiveTemplatePreviewError(previewErrorCode.value),
)

const previewSummary = computed(() => {
  const preview = myTomorrowRoutePreview.value
  if (!preview) {
    return ''
  }

  return t('bezorger.route.tomorrow.summary', {
    stops: translatePlural('bezorger.route.stops', preview.totalStops),
    orders: translatePlural('routes.stop.orders', preview.totalOrders),
    doses: translatePlural('routes.stop.doses', preview.totalQuantity),
  })
})

function stopTotalLabel(totalQuantity: number): string {
  const doses = translatePlural('routes.stop.doses', totalQuantity)
  return t('bezorger.route.stop.total', { doses })
}

function stopOrdersLabel(orderCount: number): string {
  return translatePlural('routes.stop.orders', orderCount)
}

function stopKey(stop: RoutePreviewStopItem): string {
  return `${stop.apothekerProfileId}-${stop.sequence}`
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

onMounted(() => {
  void loadMyTomorrowRoutePreview()
  subscribeToTomorrowPreviewReconnect()
})

onUnmounted(() => {
  stopTomorrowPreviewReconnect()
})
</script>

<template>
  <div
    class="mx-auto max-w-xl space-y-6 px-1"
    data-testid="bezorger-tomorrow-preview"
  >
    <CommonPageHeader
      :title="t('bezorger.route.tomorrow.title')"
      :subtitle="t('bezorger.route.tomorrow.description')"
    >
      <template #actions>
        <UBadge
          variant="subtle"
          color="neutral"
          data-testid="tomorrow-preview-label"
        >
          {{ t('bezorger.route.tomorrow.badge') }}
        </UBadge>
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          :loading="previewLoading"
          data-testid="tomorrow-reload"
          @click="loadMyTomorrowRoutePreview"
        >
          {{ t('bezorger.route.tomorrow.reload') }}
        </UButton>
      </template>
    </CommonPageHeader>

    <p
      v-if="connectionState === 'reconnecting'"
      class="text-xs text-warning"
      role="status"
    >
      {{ t('realtime.reconnecting') }}
    </p>

    <CommonLoadingSkeleton v-if="previewLoading && !myTomorrowRoutePreview" />

    <CommonErrorState
      v-else-if="previewErrorMessage && missingTemplate"
      :title="t('bezorger.route.tomorrow.noTemplate.title')"
      :description="previewErrorMessage"
    />

    <CommonErrorState
      v-else-if="previewErrorMessage && multipleActiveTemplates"
      :title="t('bezorger.route.tomorrow.multipleTemplates.title')"
      :description="previewErrorMessage"
    />

    <CommonErrorState
      v-else-if="previewErrorMessage && !myTomorrowRoutePreview"
      :title="t('bezorger.route.tomorrow.loadFailed')"
      :description="previewErrorMessage"
    />

    <template v-else-if="myTomorrowRoutePreview">
      <CommonPageSection variant="inset" data-testid="tomorrow-summary">
        <div class="space-y-1">
          <p class="text-xs font-medium uppercase tracking-wide text-toned">
            {{ t('bezorger.route.tomorrow.deliveryDate') }}
          </p>
          <p class="text-lg font-semibold text-highlighted">
            {{ myTomorrowRoutePreview.deliveryDate }}
          </p>
          <p class="text-sm text-toned">
            {{
              t('bezorger.route.tomorrow.template', {
                name: myTomorrowRoutePreview.routeTemplateName,
              })
            }}
          </p>
          <p class="text-sm text-muted">
            {{ previewSummary }}
          </p>
          <p class="text-xs text-muted">
            {{ t('bezorger.route.tomorrow.informational') }}
          </p>
        </div>
      </CommonPageSection>

      <CommonEmptyState
        v-if="myTomorrowRoutePreview.stops.length === 0"
        :title="t('bezorger.route.tomorrow.empty.title')"
        :description="t('bezorger.route.tomorrow.empty.description')"
      />

      <CommonPageSection
        v-else
        :title="t('bezorger.route.stop.remaining')"
        data-testid="tomorrow-stop-list"
      >
        <ol class="divide-y divide-default" role="list">
          <li
            v-for="stop in myTomorrowRoutePreview.stops"
            :key="stopKey(stop)"
            class="space-y-2 py-4"
          >
            <div class="min-w-0 space-y-0.5">
              <p class="text-xs font-medium uppercase tracking-wide text-toned">
                {{
                  t('bezorger.route.stop.label', { sequence: stop.sequence })
                }}
              </p>
              <h3
                class="text-base font-semibold text-highlighted wrap-break-word"
              >
                {{ stop.pharmacyName }}
              </h3>
              <p class="text-sm text-toned wrap-break-word">
                {{ stop.address.city }}
              </p>
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

            <div>
              <button
                type="button"
                class="min-h-11 text-sm text-toned underline-offset-2 hover:underline"
                :aria-expanded="isStopExpanded(stopKey(stop))"
                :aria-controls="`tomorrow-stop-details-${stopKey(stop)}`"
                @click="toggleStopDetails(stopKey(stop))"
              >
                {{ t('bezorger.route.stop.details') }}
              </button>
              <div
                v-show="isStopExpanded(stopKey(stop))"
                :id="`tomorrow-stop-details-${stopKey(stop)}`"
                class="mt-2"
              >
                <ul class="divide-y divide-default text-sm" role="list">
                  <li
                    v-for="line in stop.lines"
                    :key="line.vaccineId"
                    class="flex justify-between gap-2 py-2"
                  >
                    <span class="wrap-break-word">{{ line.vaccineName }}</span>
                    <span class="tabular-nums font-medium">{{
                      line.quantity
                    }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </li>
        </ol>
      </CommonPageSection>
    </template>
  </div>
</template>
