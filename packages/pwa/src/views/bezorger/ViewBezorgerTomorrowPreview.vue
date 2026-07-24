<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useDeliveryRoutes } from '@/composables/useDeliveryRoutes'
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
} = useDeliveryRoutes()

const { connectionState } = useRealtimeConnection()

const missingTemplate = computed(() =>
  isMissingTemplatePreviewError(previewErrorCode.value),
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

onMounted(() => {
  void loadMyTomorrowRoutePreview()
  subscribeToTomorrowPreviewReconnect()
})

onUnmounted(() => {
  stopTomorrowPreviewReconnect()
})
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 px-1">
    <div>
      <p
        class="text-xs font-medium uppercase tracking-wide text-muted"
        data-testid="tomorrow-preview-label"
      >
        {{ t('bezorger.route.tomorrow.badge') }}
      </p>
      <h1 class="mt-1 text-2xl font-semibold">
        {{ t('bezorger.route.tomorrow.title') }}
      </h1>
      <p class="mt-1 text-sm text-muted">
        {{ t('bezorger.route.tomorrow.description') }}
      </p>
      <p
        v-if="connectionState === 'reconnecting'"
        class="mt-1 text-xs text-warning"
      >
        {{ t('realtime.reconnecting') }}
      </p>
    </div>

    <div class="flex gap-2">
      <UButton
        size="sm"
        variant="soft"
        :loading="previewLoading"
        @click="loadMyTomorrowRoutePreview"
      >
        {{ t('bezorger.route.tomorrow.reload') }}
      </UButton>
    </div>

    <CommonLoadingSkeleton v-if="previewLoading && !myTomorrowRoutePreview" />

    <CommonErrorState
      v-else-if="previewErrorMessage && missingTemplate"
      :title="t('bezorger.route.tomorrow.noTemplate.title')"
      :description="previewErrorMessage"
    />

    <CommonErrorState
      v-else-if="previewErrorMessage && !myTomorrowRoutePreview"
      :title="t('bezorger.route.tomorrow.loadFailed')"
      :description="previewErrorMessage"
    />

    <template v-else-if="myTomorrowRoutePreview">
      <div class="rounded-lg bg-elevated/50 px-4 py-3">
        <p class="text-sm text-muted">
          {{ t('bezorger.route.tomorrow.deliveryDate') }}
        </p>
        <p class="text-lg font-semibold">
          {{ myTomorrowRoutePreview.deliveryDate }}
        </p>
        <p class="mt-1 text-sm">
          {{
            t('bezorger.route.tomorrow.template', {
              name: myTomorrowRoutePreview.routeTemplateName,
            })
          }}
        </p>
        <p class="mt-1 text-sm text-muted">
          {{ previewSummary }}
        </p>
      </div>

      <CommonEmptyState
        v-if="myTomorrowRoutePreview.stops.length === 0"
        :title="t('bezorger.route.tomorrow.empty.title')"
        :description="t('bezorger.route.tomorrow.empty.description')"
      />

      <ol v-else class="space-y-4">
        <li
          v-for="stop in myTomorrowRoutePreview.stops"
          :key="`${stop.apothekerProfileId}-${stop.sequence}`"
          class="rounded-lg border border-default px-4 py-4"
        >
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            {{ t('bezorger.route.stop.label', { sequence: stop.sequence }) }}
          </p>
          <h2 class="mt-1 text-lg font-semibold">{{ stop.pharmacyName }}</h2>
          <p class="mt-1 text-sm">{{ formatAddress(stop) }}</p>
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
              <span class="tabular-nums">{{ line.quantity }}</span>
            </li>
          </ul>
        </li>
      </ol>
    </template>
  </div>
</template>
