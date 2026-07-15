<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'

import { OrderStatus } from '@vaccin-delivery/types'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonRealtimeStatus from '@/components/common/CommonRealtimeStatus.vue'
import { useOrders } from '@/composables/useOrders'

const {
  adminOrders,
  loading,
  errorMessage,
  loadAdminOrders,
  subscribeToAdminOrderEvents,
  stopAdminOrderSubscriptions,
} = useOrders()

const filters = reactive<{
  isoYear?: number
  isoWeek?: number
  status?: OrderStatus
}>({
  isoYear: undefined,
  isoWeek: undefined,
  status: undefined,
})

const adminSubscriptionCleanup = ref<(() => void) | null>(null)

void loadAdminOrders()

function currentFilterVariables() {
  return {
    isoYear: filters.isoYear,
    isoWeek: filters.isoWeek,
    status: filters.status,
  }
}

function restartAdminSubscriptions() {
  adminSubscriptionCleanup.value?.()
  adminSubscriptionCleanup.value = subscribeToAdminOrderEvents(
    currentFilterVariables(),
  )
}

onMounted(() => {
  restartAdminSubscriptions()
})

onUnmounted(() => {
  adminSubscriptionCleanup.value?.()
  stopAdminOrderSubscriptions()
})

function applyFilters() {
  void loadAdminOrders(currentFilterVariables())
  restartAdminSubscriptions()
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('nl-BE')
}

function formatDeliveryDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}
</script>

<template>
  <div class="space-y-6">
    <CommonRealtimeStatus />

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Bestellingenoverzicht</h2>
      </template>

      <div class="mb-4 grid gap-3 sm:grid-cols-4">
        <UInput
          v-model.number="filters.isoYear"
          type="number"
          placeholder="ISO-jaar"
        />
        <UInput
          v-model.number="filters.isoWeek"
          type="number"
          placeholder="ISO-week"
        />
        <USelect
          v-model="filters.status"
          :items="[
            { label: 'Alle statussen', value: undefined },
            { label: 'PENDING', value: OrderStatus.Pending },
            { label: 'PLANNED', value: OrderStatus.Planned },
            { label: 'DELIVERED', value: OrderStatus.Delivered },
            { label: 'CANCELLED', value: OrderStatus.Cancelled },
          ]"
          placeholder="Status"
        />
        <UButton @click="applyFilters">Filteren</UButton>
      </div>

      <CommonLoadingSkeleton v-if="loading && adminOrders.length === 0" />

      <CommonErrorState
        v-else-if="errorMessage"
        title="Bestellingen laden mislukt"
        :description="errorMessage"
      />

      <CommonEmptyState
        v-else-if="adminOrders.length === 0"
        title="Geen bestellingen"
        description="Er zijn geen bestellingen gevonden voor deze filter."
      />

      <div v-else class="space-y-4">
        <UCard v-for="order in adminOrders" :key="order.id">
          <div class="space-y-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">Bestelling {{ order.id }}</h3>
              <UBadge variant="subtle">{{ order.status }}</UBadge>
            </div>
            <p>
              <span class="font-medium">Apotheker:</span>
              {{ order.apotheker.firstName }} {{ order.apotheker.lastName }}
              ({{ order.apotheker.email }})
            </p>
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
          </div>
        </UCard>
      </div>
    </UCard>
  </div>
</template>
