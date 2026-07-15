<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import { OrderStatus } from '@vaccin-delivery/types'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonRealtimeStatus from '@/components/common/CommonRealtimeStatus.vue'
import { registerReconnectHandler } from '@/composables/useGraphQL'
import { useOrders } from '@/composables/useOrders'

const {
  myOrders,
  loading,
  errorMessage,
  loadMyOrders,
  loadWeeklySummary,
  cancelOwnOrder,
  subscribeToMyOrderEvents,
  stopMyOrderSubscriptions,
  isOrderCannotBeCancelledError,
  mapGraphQLError,
} = useOrders()

const cancellingId = ref<string | null>(null)
const actionError = ref<string | null>(null)
let reconnectCleanup: (() => void) | null = null

void loadMyOrders()

onMounted(() => {
  subscribeToMyOrderEvents()
  reconnectCleanup = registerReconnectHandler(async () => {
    await loadMyOrders()
    await loadWeeklySummary()
  })
})

onUnmounted(() => {
  stopMyOrderSubscriptions()
  reconnectCleanup?.()
})

function canCancel(status: OrderStatus): boolean {
  return status === OrderStatus.Pending
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('nl-BE')
}

function formatDeliveryDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

async function onCancel(id: string) {
  actionError.value = null
  cancellingId.value = id

  try {
    await cancelOwnOrder(id)
    await loadMyOrders()
  } catch (error: unknown) {
    actionError.value = isOrderCannotBeCancelledError(error)
      ? 'Deze bestelling kan niet meer geannuleerd worden.'
      : mapGraphQLError(error)
  } finally {
    cancellingId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <CommonRealtimeStatus />

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">Mijn bestellingen</h2>
          <UButton to="/apotheker/orders/new" size="sm">Nieuwe bestelling</UButton>
        </div>
      </template>

      <CommonLoadingSkeleton v-if="loading && myOrders.length === 0" />

      <CommonErrorState
        v-else-if="errorMessage"
        title="Bestellingen laden mislukt"
        :description="errorMessage"
      />

      <CommonEmptyState
        v-else-if="myOrders.length === 0"
        title="Geen bestellingen"
        description="Je hebt nog geen bestellingen geplaatst."
      />

      <div v-else class="space-y-4">
        <UCard v-for="order in myOrders" :key="order.id">
          <div class="space-y-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">Bestelling {{ order.id }}</h3>
              <UBadge variant="subtle">{{ order.status }}</UBadge>
            </div>
            <p>
              <span class="font-medium">Ingediend:</span>
              {{ formatDateTime(order.submittedAt) }}
            </p>
            <p>
              <span class="font-medium">Leverdatum:</span>
              {{ formatDeliveryDate(order.deliveryDate) }}
            </p>
            <p>
              <span class="font-medium">ISO-week:</span>
              {{ order.isoWeek }} / {{ order.isoYear }}
            </p>
            <p>
              <span class="font-medium">Totaal:</span>
              {{ order.totalQuantity }} dosissen
            </p>

            <div class="space-y-2">
              <p class="font-medium">Regels</p>
              <div
                v-for="line in order.orderLines"
                :key="`${order.id}-${line.vaccineId}`"
                class="rounded border border-default p-2"
              >
                {{ line.vaccineName }} — {{ line.quantity }} dosissen
              </div>
            </div>

            <UButton
              v-if="canCancel(order.status)"
              size="sm"
              color="error"
              variant="outline"
              :loading="cancellingId === order.id"
              @click="onCancel(order.id)"
            >
              Annuleren
            </UButton>
          </div>
        </UCard>
      </div>

      <UAlert
        v-if="actionError"
        class="mt-4"
        color="error"
        variant="subtle"
        :title="actionError"
      />
    </UCard>
  </div>
</template>
