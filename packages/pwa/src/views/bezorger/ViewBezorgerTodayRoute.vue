<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useDeliveryRoutes } from '@/composables/useDeliveryRoutes'
import { useRealtimeConnection } from '@/composables/useRealtimeConnection'

const {
  myTodayRoute,
  loading,
  errorMessage,
  loadMyTodayRoute,
  subscribeToTodayRouteUpdates,
  stopTodayRouteSubscription,
  formatAddress,
} = useDeliveryRoutes()

const { connectionState } = useRealtimeConnection()

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
      <h1 class="text-2xl font-semibold">Route van vandaag</h1>
      <p class="mt-1 text-sm text-muted">
        Stops met adressen en dosissen zoals bij generatie vastgelegd.
      </p>
      <p
        v-if="connectionState === 'reconnecting'"
        class="mt-1 text-xs text-warning"
      >
        Verbinding herstellen…
      </p>
    </div>

    <CommonLoadingSkeleton v-if="loading && !myTodayRoute" />
    <CommonErrorState
      v-else-if="errorMessage && !myTodayRoute"
      title="Kon route niet laden"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="!myTodayRoute"
      title="Geen route voor vandaag"
      description="Er is nog geen gegenereerde route voor jouw profiel op de huidige leveringsdatum."
    />

    <template v-else>
      <div class="rounded-lg bg-elevated/50 px-4 py-3">
        <p class="text-sm text-muted">Status</p>
        <p class="text-lg font-semibold">{{ myTodayRoute.status }}</p>
        <p class="mt-1 text-sm text-muted">
          Datum {{ myTodayRoute.deliveryDate }}
        </p>
      </div>

      <CommonEmptyState
        v-if="myTodayRoute.stops.length === 0"
        title="Lege route"
        description="Je route is toegewezen, maar er zijn vandaag geen stops met kwalificerende bestellingen."
      />

      <ol v-else class="space-y-4">
        <li
          v-for="stop in myTodayRoute.stops"
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
              <span class="font-medium">{{ line.quantity }}</span>
            </li>
          </ul>
        </li>
      </ol>
    </template>
  </div>
</template>
