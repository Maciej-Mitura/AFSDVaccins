<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { RouteStatus, useDeliveryRoutes } from '@/composables/useDeliveryRoutes'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useRealtimeConnection } from '@/composables/useRealtimeConnection'

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
      v-else-if="!loading && !myTodayRoute"
      title="Geen route voor vandaag"
      description="Er is nog geen gegenereerde route voor jouw profiel op de huidige leveringsdatum."
    />

    <template v-else-if="myTodayRoute">
      <div class="rounded-lg bg-elevated/50 px-4 py-3">
        <p class="text-sm text-muted">Status</p>
        <p class="text-lg font-semibold" data-testid="route-status">
          {{ myTodayRoute.status }}
        </p>
        <p class="mt-1 text-sm text-muted">
          Datum {{ myTodayRoute.deliveryDate }}
        </p>
        <p
          v-if="
            myTodayRoute.status === RouteStatus.Cancelled && latestCancelReason
          "
          class="mt-2 text-sm"
        >
          Reden: {{ latestCancelReason }}
        </p>
        <p
          v-else-if="myTodayRoute.status === RouteStatus.Completed"
          class="mt-2 text-sm text-muted"
        >
          Route afgerond. Bestellingen worden apart als geleverd gemarkeerd.
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
          title="Route starten?"
          description="Bevestig dat je nu begint met deze bezorgroute."
        />
        <UAlert
          v-if="confirmComplete"
          color="warning"
          variant="subtle"
          title="Route voltooien?"
          description="Bevestig dat je alle stops van deze route hebt afgerond. Bestellingen worden hierdoor niet automatisch geleverd."
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
          {{ confirmStart ? 'Bevestig starten' : 'Route starten' }}
        </UButton>
        <UButton
          v-if="confirmStart"
          block
          size="lg"
          variant="ghost"
          :disabled="!isOnline || updatingStatus"
          @click="cancelStartConfirm"
        >
          Annuleren
        </UButton>

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
          {{ confirmComplete ? 'Bevestig voltooien' : 'Route voltooien' }}
        </UButton>
        <UButton
          v-if="confirmComplete"
          block
          size="lg"
          variant="ghost"
          :disabled="!isOnline || updatingStatus"
          @click="cancelCompleteConfirm"
        >
          Annuleren
        </UButton>
      </div>

      <CommonErrorState
        v-if="statusError"
        title="Statuswijziging mislukt"
        :description="statusError"
      />

      <div
        v-if="myTodayRoute.statusHistory.length > 0"
        class="rounded-lg border border-default px-4 py-3"
      >
        <p class="text-sm font-medium">Statusgeschiedenis</p>
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
        title="Lege route"
        description="Je route is toegewezen, maar er zijn vandaag geen stops met kwalificerende bestellingen."
      />

      <ol v-else class="space-y-4">
          <li
            v-for="stop in myTodayRoute.stops"
            :key="`${stop.apothekerProfileId}-${stop.sequence}`"
            class="rounded-lg border border-default px-4 py-4"
            data-testid="route-stop"
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
