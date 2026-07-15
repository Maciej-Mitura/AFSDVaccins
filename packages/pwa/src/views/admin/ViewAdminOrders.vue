<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'

import { OrderStatus } from '@vaccin-delivery/types'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonRealtimeStatus from '@/components/common/CommonRealtimeStatus.vue'
import { registerReconnectHandler } from '@/composables/useGraphQL'
import { useAdminOperationsFeed } from '@/composables/useAdminOperationsFeed'
import { useOrders } from '@/composables/useOrders'
import { useStock } from '@/composables/useStock'

const {
  adminOrders,
  dailyOverview,
  ordersLoading,
  ordersError,
  statusActionLoading,
  statusActionError,
  cancelActionLoading,
  cancelActionError,
  loadAdminOrders,
  loadAdminDailyOverview,
  subscribeToAdminOrderEvents,
  stopAdminOrderSubscriptions,
  updateOrderStatus,
  cancelOrderAsAdmin,
  clearStatusActionError,
  clearCancelActionError,
  isInvalidOrderStatusTransitionError,
  isInsufficientStockError,
  isOrderCannotBeCancelledError,
  mapGraphQLError,
} = useOrders()

const { overview: stockOverview, loadStockOverview } = useStock()
const { feedEvents, subscribeToAdminOperationsFeed, stopFeedSubscription } =
  useAdminOperationsFeed()

const filters = reactive<{
  deliveryDate: string
  isoYear?: number
  isoWeek?: number
  status?: OrderStatus
}>({
  deliveryDate: new Date().toISOString().slice(0, 10),
  isoYear: undefined,
  isoWeek: undefined,
  status: undefined,
})

const actingOrderId = ref<string | null>(null)
const confirmDeliverId = ref<string | null>(null)
const confirmCancelId = ref<string | null>(null)

const adminSubscriptionCleanup = ref<(() => void) | null>(null)
let reconnectCleanup: (() => void) | null = null

const stockByVaccineId = computed(() => {
  const map = new Map<string, number>()

  for (const vaccine of stockOverview.value) {
    map.set(vaccine.id, vaccine.stockQuantity)
  }

  return map
})

function currentFilterVariables() {
  return {
    deliveryDate: filters.deliveryDate || undefined,
    isoYear: filters.isoYear,
    isoWeek: filters.isoWeek,
    status: filters.status,
  }
}

async function refreshData() {
  await Promise.all([
    loadAdminOrders(currentFilterVariables()),
    filters.deliveryDate
      ? loadAdminDailyOverview(filters.deliveryDate)
      : Promise.resolve(),
    loadStockOverview(),
  ])
}

void refreshData()

function restartAdminSubscriptions() {
  adminSubscriptionCleanup.value?.()
  adminSubscriptionCleanup.value = subscribeToAdminOrderEvents(
    currentFilterVariables(),
  )
}

onMounted(() => {
  restartAdminSubscriptions()
  subscribeToAdminOperationsFeed()
  reconnectCleanup = registerReconnectHandler(async () => {
    await refreshData()
  })
})

onUnmounted(() => {
  adminSubscriptionCleanup.value?.()
  stopAdminOrderSubscriptions()
  stopFeedSubscription()
  reconnectCleanup?.()
})

async function applyFilters() {
  clearStatusActionError()
  clearCancelActionError()
  await refreshData()
  restartAdminSubscriptions()
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('nl-BE')
}

function formatDeliveryDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function statusLabel(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.Pending:
    case OrderStatus.Planned:
      return 'in behandeling'
    case OrderStatus.Delivered:
      return 'geleverd'
    case OrderStatus.Cancelled:
      return 'geannuleerd'
    default:
      return status
  }
}

function canMarkPlanned(status: OrderStatus): boolean {
  return status === OrderStatus.Pending
}

function canMarkDelivered(status: OrderStatus): boolean {
  return status === OrderStatus.Pending || status === OrderStatus.Planned
}

function canCancel(status: OrderStatus): boolean {
  return status === OrderStatus.Pending
}

function orderStockReady(order: (typeof adminOrders.value)[number]): boolean {
  return order.orderLines.every(line => {
    const available = stockByVaccineId.value.get(line.vaccineId) ?? 0
    return available >= line.quantity
  })
}

function handleStatusActionError(error: unknown) {
  if (isInsufficientStockError(error)) {
    statusActionError.value =
      'Onvoldoende voorraad om deze bestelling te leveren. Er is geen wijziging doorgevoerd.'
    return
  }

  if (isInvalidOrderStatusTransitionError(error)) {
    statusActionError.value = 'Deze statusovergang is niet toegestaan.'
    return
  }

  statusActionError.value = mapGraphQLError(error)
}

function handleCancelActionError(error: unknown) {
  if (isOrderCannotBeCancelledError(error)) {
    cancelActionError.value = 'Deze bestelling kan niet meer geannuleerd worden.'
    return
  }

  cancelActionError.value = mapGraphQLError(error)
}

async function onMarkPlanned(id: string) {
  clearStatusActionError()
  actingOrderId.value = id

  try {
    await updateOrderStatus(id, OrderStatus.Planned)
    await refreshData()
  } catch (error: unknown) {
    handleStatusActionError(error)
  } finally {
    actingOrderId.value = null
  }
}

async function onMarkDelivered(id: string) {
  confirmDeliverId.value = null
  clearStatusActionError()
  actingOrderId.value = id

  try {
    await updateOrderStatus(id, OrderStatus.Delivered)
    await refreshData()
    await loadStockOverview()
  } catch (error: unknown) {
    handleStatusActionError(error)
  } finally {
    actingOrderId.value = null
  }
}

async function onCancel(id: string) {
  confirmCancelId.value = null
  clearCancelActionError()
  actingOrderId.value = id

  try {
    await cancelOrderAsAdmin(id)
    await refreshData()
  } catch (error: unknown) {
    handleCancelActionError(error)
  } finally {
    actingOrderId.value = null
  }
}
async function closeDeliverModal() {
  confirmDeliverId.value = null
}

async function closeCancelModal() {
  confirmCancelId.value = null
}
</script>

<template>
  <div class="space-y-6">
    <CommonRealtimeStatus />

    <UCard v-if="dailyOverview">
      <template #header>
        <h2 class="text-lg font-semibold">
          Dagoverzicht — {{ formatDeliveryDate(dailyOverview.deliveryDate) }}
        </h2>
      </template>

      <div class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p>
          <span class="font-medium">Actieve bestellingen:</span>
          {{ dailyOverview.totalOrders }}
        </p>
        <p>
          <span class="font-medium">Actieve dosissen:</span>
          {{ dailyOverview.totalDoses }}
        </p>
        <p>
          <span class="font-medium">Geannuleerd:</span>
          {{ dailyOverview.cancelledOrderCount }} bestellingen /
          {{ dailyOverview.cancelledDoseCount }} dosissen
        </p>
        <p>
          <span class="font-medium">Per status:</span>
          {{
            dailyOverview.statusCounts
              .filter(item => item.count > 0)
              .map(item => `${item.status}: ${item.count}`)
              .join(', ')
          }}
        </p>
      </div>
    </UCard>

    <UCard v-if="feedEvents.length > 0">
      <template #header>
        <h3 class="font-semibold">Live operaties</h3>
      </template>
      <ul class="space-y-2 text-sm">
        <li v-for="(event, index) in feedEvents.slice(0, 5)" :key="index">
          <span class="font-medium">{{ event.eventType }}</span>
          — {{ event.message }}
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Bestellingenbeheer</h2>
      </template>

      <div class="mb-4 grid gap-3 sm:grid-cols-5">
        <UInput v-model="filters.deliveryDate" type="date" />
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

      <CommonLoadingSkeleton v-if="ordersLoading && adminOrders.length === 0" />

      <CommonErrorState
        v-if="ordersError && adminOrders.length === 0"
        title="Bestellingen laden mislukt"
        :description="ordersError"
      />

      <CommonEmptyState
        v-else-if="!ordersLoading && adminOrders.length === 0"
        title="Geen bestellingen"
        description="Er zijn geen bestellingen gevonden voor deze filter."
      />

      <div v-if="adminOrders.length > 0" class="space-y-4">
        <UCard v-for="order in adminOrders" :key="order.id">
          <div class="space-y-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">Bestelling {{ order.id }}</h3>
              <UBadge variant="subtle">{{ statusLabel(order.status) }}</UBadge>
              <UBadge
                v-if="canMarkDelivered(order.status)"
                :color="orderStockReady(order) ? 'success' : 'warning'"
                variant="subtle"
              >
                {{
                  orderStockReady(order)
                    ? 'Voorraad OK'
                    : 'Onvoldoende voorraad'
                }}
              </UBadge>
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
                <span class="text-muted">
                  (voorraad:
                  {{ stockByVaccineId.get(line.vaccineId) ?? '—' }})
                </span>
              </div>
            </div>

            <div v-if="order.statusHistory?.length" class="space-y-2">
              <p class="font-medium">Statusgeschiedenis</p>
              <div
                v-for="(entry, index) in order.statusHistory"
                :key="`${order.id}-history-${index}`"
                class="rounded border border-default p-2 text-xs"
              >
                {{ entry.fromStatus ?? '—' }} → {{ entry.toStatus }}
                op {{ formatDateTime(entry.changedAt) }}
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="canMarkPlanned(order.status)"
                size="sm"
                variant="outline"
                :loading="
                  actingOrderId === order.id &&
                  (statusActionLoading || cancelActionLoading)
                "
                @click="onMarkPlanned(order.id)"
              >
                Markeer gepland
              </UButton>
              <UButton
                v-if="canMarkDelivered(order.status)"
                size="sm"
                color="primary"
                :loading="
                  actingOrderId === order.id &&
                  (statusActionLoading || cancelActionLoading)
                "
                @click="() => { confirmDeliverId = order.id }"
              >
                Markeer geleverd
              </UButton>
              <UButton
                v-if="canCancel(order.status)"
                size="sm"
                color="error"
                variant="outline"
                :loading="
                  actingOrderId === order.id &&
                  (statusActionLoading || cancelActionLoading)
                "
                @click="() => { confirmCancelId = order.id }"
              >
                Annuleren
              </UButton>
            </div>
          </div>
        </UCard>
      </div>

      <UAlert
        v-if="statusActionError"
        class="mt-4"
        color="error"
        variant="subtle"
        :title="statusActionError"
        :close-button="{ icon: 'i-lucide-x', color: 'neutral', variant: 'link' }"
        @close="clearStatusActionError"
      />

      <UAlert
        v-if="cancelActionError"
        class="mt-4"
        color="error"
        variant="subtle"
        :title="cancelActionError"
        :close-button="{ icon: 'i-lucide-x', color: 'neutral', variant: 'link' }"
        @close="clearCancelActionError"
      />
    </UCard>

    <UModal
      :open="confirmDeliverId !== null"
      title="Bestelling leveren"
      @update:open="open => { if (!open) void closeDeliverModal() }"
    >
      <template #body>
        <p class="text-sm">
          Bevestig dat deze bestelling geleverd is. De voorraad wordt nu
          afgetrokken.
        </p>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="() => { void closeDeliverModal() }">
          Terug
        </UButton>
        <UButton
          color="primary"
          @click="() => { if (confirmDeliverId) void onMarkDelivered(confirmDeliverId) }"
        >
          Bevestig levering
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="confirmCancelId !== null"
      title="Bestelling annuleren"
      @update:open="open => { if (!open) void closeCancelModal() }"
    >
      <template #body>
        <p class="text-sm">
          Bevestig dat je deze bestelling wilt annuleren. Er wordt geen voorraad
          gewijzigd.
        </p>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="() => { void closeCancelModal() }">
          Terug
        </UButton>
        <UButton
          color="error"
          @click="() => { if (confirmCancelId) void onCancel(confirmCancelId) }"
        >
          Bevestig annulering
        </UButton>
      </template>
    </UModal>
  </div>
</template>
