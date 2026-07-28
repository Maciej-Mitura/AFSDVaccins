<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import FeatureOrderHistoryCard from '@/components/feature/order-history/FeatureOrderHistoryCard.vue'
import FeatureOrderHistoryFilters from '@/components/feature/order-history/FeatureOrderHistoryFilters.vue'
import FeatureOrderHistoryTable from '@/components/feature/order-history/FeatureOrderHistoryTable.vue'
import { useOrderHistory } from '@/composables/useOrderHistory'

const props = defineProps<{
  title: string
  summary: string
  showPharmacy: boolean
  allowApothekerFilter: boolean
  pharmacyOptions?: Array<{ label: string; value: string }>
}>()

const { t } = useI18n()

const history = useOrderHistory({
  allowApothekerFilter: props.allowApothekerFilter,
})

const {
  filters,
  orders,
  totalCount,
  hasNextPage,
  loading,
  loadingMore,
  errorMessage,
  isEmpty,
  isFilteredEmpty,
  load,
  loadMore,
  applyFilters,
  clearFilters,
  buildInput,
} = history

onMounted(() => {
  void load()
})

defineExpose({
  filters,
  orders,
  load,
  loadMore,
  applyFilters,
  clearFilters,
  buildInput,
  allowApothekerFilter: props.allowApothekerFilter,
})
</script>

<template>
  <div class="space-y-6" data-testid="order-history-list">
    <div>
      <h2 class="text-lg font-semibold">{{ title }}</h2>
      <p class="mt-1 text-sm text-muted">{{ summary }}</p>
      <p
        v-if="totalCount != null && !loading"
        class="mt-1 text-sm text-muted"
        data-testid="order-history-total"
      >
        {{ t('orderHistory.totalCount', { count: totalCount }) }}
      </p>
    </div>

    <UCard>
      <FeatureOrderHistoryFilters
        v-model:filters="filters"
        :show-pharmacy-filter="allowApothekerFilter"
        :pharmacy-options="pharmacyOptions"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </UCard>

    <CommonLoadingSkeleton v-if="loading && orders.length === 0" />

    <CommonErrorState
      v-else-if="errorMessage && orders.length === 0"
      :title="t('orderHistory.error.title')"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="isFilteredEmpty"
      :title="t('orderHistory.empty.filtered.title')"
      :description="t('orderHistory.empty.filtered.description')"
    />

    <CommonEmptyState
      v-else-if="isEmpty"
      :title="t('orderHistory.empty.title')"
      :description="t('orderHistory.empty.description')"
    />

    <template v-else-if="orders.length > 0">
      <div class="hidden md:block">
        <FeatureOrderHistoryTable
          :orders="orders"
          :show-pharmacy="showPharmacy"
        />
      </div>

      <div class="space-y-3 md:hidden" data-testid="order-history-cards">
        <FeatureOrderHistoryCard
          v-for="order in orders"
          :key="order.id"
          :order="order"
          :show-pharmacy="showPharmacy"
        />
      </div>

      <div class="flex flex-col items-start gap-3">
        <p
          v-if="loadingMore"
          class="text-sm text-muted"
          role="status"
          aria-live="polite"
          data-testid="order-history-loading-more"
        >
          {{ t('orderHistory.pagination.loadingMore') }}
        </p>

        <UButton
          v-if="hasNextPage"
          :loading="loadingMore"
          :disabled="loadingMore"
          data-testid="order-history-load-more"
          @click="loadMore"
        >
          {{ t('orderHistory.pagination.loadMore') }}
        </UButton>

        <p
          v-else-if="!loading"
          class="text-sm text-muted"
          data-testid="order-history-end"
        >
          {{ t('orderHistory.pagination.end') }}
        </p>

        <UAlert
          v-if="errorMessage && orders.length > 0"
          color="error"
          variant="subtle"
          :title="errorMessage"
        />
      </div>
    </template>
  </div>
</template>
