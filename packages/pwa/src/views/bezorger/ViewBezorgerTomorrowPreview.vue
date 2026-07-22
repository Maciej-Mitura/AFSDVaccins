<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useDeliveryRoutes } from '@/composables/useDeliveryRoutes'
import { useRealtimeConnection } from '@/composables/useRealtimeConnection'

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
        Voorbeeld — niet opgeslagen
      </p>
      <h1 class="mt-1 text-2xl font-semibold">Voorbeeldroute voor morgen</h1>
      <p class="mt-1 text-sm text-muted">
        Live berekening op basis van je template en kwalificerende bestellingen.
        Dit is geen gegenereerde route van vandaag.
      </p>
      <p
        v-if="connectionState === 'reconnecting'"
        class="mt-1 text-xs text-warning"
      >
        Verbinding herstellen…
      </p>
    </div>

    <div class="flex gap-2">
      <UButton
        size="sm"
        variant="soft"
        :loading="previewLoading"
        @click="loadMyTomorrowRoutePreview"
      >
        Opnieuw laden
      </UButton>
    </div>

    <CommonLoadingSkeleton v-if="previewLoading && !myTomorrowRoutePreview" />

    <CommonErrorState
      v-else-if="previewErrorMessage && missingTemplate"
      title="Geen routetemplate"
      :description="previewErrorMessage"
    />

    <CommonErrorState
      v-else-if="previewErrorMessage && !myTomorrowRoutePreview"
      title="Kon voorbeeldroute niet laden"
      :description="previewErrorMessage"
    />

    <template v-else-if="myTomorrowRoutePreview">
      <div class="rounded-lg bg-elevated/50 px-4 py-3">
        <p class="text-sm text-muted">Leveringsdatum (morgen)</p>
        <p class="text-lg font-semibold">
          {{ myTomorrowRoutePreview.deliveryDate }}
        </p>
        <p class="mt-1 text-sm">
          Template:
          <span class="font-medium">{{
            myTomorrowRoutePreview.routeTemplateName
          }}</span>
        </p>
        <p class="mt-1 text-sm text-muted">
          {{ myTomorrowRoutePreview.totalStops }} stop(s) ·
          {{ myTomorrowRoutePreview.totalOrders }} bestelling(en) ·
          {{ myTomorrowRoutePreview.totalQuantity }} dosissen
        </p>
      </div>

      <CommonEmptyState
        v-if="myTomorrowRoutePreview.stops.length === 0"
        title="Geen stops voor morgen"
        description="Je template is gekoppeld, maar er zijn nog geen kwalificerende bestellingen voor morgen. Apotheken zonder bestelling worden overgeslagen."
      />

      <ol v-else class="space-y-4">
        <li
          v-for="stop in myTomorrowRoutePreview.stops"
          :key="`${stop.apothekerProfileId}-${stop.sequence}`"
          class="rounded-lg border border-default px-4 py-4"
        >
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            Stop {{ stop.sequence }}
          </p>
          <h2 class="mt-1 text-lg font-semibold">{{ stop.pharmacyName }}</h2>
          <p class="mt-1 text-sm">{{ formatAddress(stop) }}</p>
          <p class="mt-3 text-sm font-medium">
            Totaal {{ stop.totalQuantity }} dosissen
            <span class="font-normal text-muted">
              ({{ stop.orderCount }} bestelling{{
                stop.orderCount === 1 ? '' : 'en'
              }})
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
