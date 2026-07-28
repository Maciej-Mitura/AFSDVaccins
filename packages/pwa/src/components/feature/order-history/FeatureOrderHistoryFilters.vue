<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { OrderStatus } from '@vaccin-delivery/types'

import type {
  OrderHistoryFilterForm,
  OrderHistoryPeriod,
} from '@/composables/order-history-filters'
import { orderStatusLabel } from '@/i18n'

const filters = defineModel<OrderHistoryFilterForm>('filters', {
  required: true,
})

const props = defineProps<{
  showPharmacyFilter?: boolean
  pharmacyOptions?: Array<{ label: string; value: string }>
}>()

const emit = defineEmits<{
  apply: []
  clear: []
}>()

const { t } = useI18n()

const statusItems = computed(() => [
  { label: t('orders.filter.allStatuses'), value: undefined },
  { label: orderStatusLabel(OrderStatus.Pending), value: OrderStatus.Pending },
  { label: orderStatusLabel(OrderStatus.Planned), value: OrderStatus.Planned },
  {
    label: orderStatusLabel(OrderStatus.Delivered),
    value: OrderStatus.Delivered,
  },
  {
    label: orderStatusLabel(OrderStatus.Cancelled),
    value: OrderStatus.Cancelled,
  },
])

const periodItems = computed(() => [
  {
    label: t('orderHistory.period.all'),
    value: 'all' satisfies OrderHistoryPeriod,
  },
  {
    label: t('orderHistory.period.last7'),
    value: '7d' satisfies OrderHistoryPeriod,
  },
  {
    label: t('orderHistory.period.last30'),
    value: '30d' satisfies OrderHistoryPeriod,
  },
  {
    label: t('orderHistory.period.last90'),
    value: '90d' satisfies OrderHistoryPeriod,
  },
  {
    label: t('orderHistory.period.custom'),
    value: 'custom' satisfies OrderHistoryPeriod,
  },
])

const pharmacyItems = computed(() => [
  { label: t('orderHistory.filter.allPharmacies'), value: undefined },
  ...(props.pharmacyOptions ?? []),
])

function onPeriodUpdate(value: OrderHistoryPeriod | undefined) {
  filters.value.period = value ?? 'all'
  if (filters.value.period !== 'custom') {
    filters.value.deliveryDateFrom = ''
    filters.value.deliveryDateTo = ''
  }
}
</script>

<template>
  <form
    class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
    @submit.prevent="emit('apply')"
  >
    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium" for="order-history-search">
        {{ t('orderHistory.filter.search') }}
      </label>
      <UInput
        id="order-history-search"
        v-model="filters.search"
        type="search"
        :placeholder="t('orderHistory.filter.searchPlaceholder')"
        autocomplete="off"
      />
    </div>

    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium" for="order-history-status">
        {{ t('orderHistory.filter.status') }}
      </label>
      <USelect
        id="order-history-status"
        v-model="filters.status"
        :items="statusItems"
        :placeholder="t('orderHistory.filter.status')"
      />
    </div>

    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium" for="order-history-period">
        {{ t('orderHistory.filter.period') }}
      </label>
      <USelect
        id="order-history-period"
        :model-value="filters.period"
        :items="periodItems"
        :placeholder="t('orderHistory.filter.period')"
        @update:model-value="onPeriodUpdate($event as OrderHistoryPeriod)"
      />
    </div>

    <div v-if="filters.period === 'custom'" class="flex flex-col gap-1">
      <label class="text-sm font-medium" for="order-history-delivery-from">
        {{ t('orderHistory.filter.deliveryFrom') }}
      </label>
      <UInput
        id="order-history-delivery-from"
        v-model="filters.deliveryDateFrom"
        type="date"
      />
    </div>

    <div v-if="filters.period === 'custom'" class="flex flex-col gap-1">
      <label class="text-sm font-medium" for="order-history-delivery-to">
        {{ t('orderHistory.filter.deliveryTo') }}
      </label>
      <UInput
        id="order-history-delivery-to"
        v-model="filters.deliveryDateTo"
        type="date"
      />
    </div>

    <div v-if="showPharmacyFilter" class="flex flex-col gap-1">
      <label class="text-sm font-medium" for="order-history-pharmacy">
        {{ t('orderHistory.filter.pharmacy') }}
      </label>
      <USelect
        id="order-history-pharmacy"
        v-model="filters.apothekerId"
        :items="pharmacyItems"
        :placeholder="t('orderHistory.filter.pharmacy')"
      />
    </div>

    <div
      class="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-2"
    >
      <UButton type="submit">
        {{ t('common.filter') }}
      </UButton>
      <UButton type="button" variant="outline" @click="emit('clear')">
        {{ t('orderHistory.filter.clear') }}
      </UButton>
    </div>
  </form>
</template>
