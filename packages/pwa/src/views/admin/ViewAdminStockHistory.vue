<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useStock } from '@/composables/useStock'
import { useVaccines } from '@/composables/useVaccines'
import { formatDateTime } from '@/i18n'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const vaccineId = computed(() => route.params.vaccineId as string)

const { vaccines, loadVaccines } = useVaccines()
const { history, loading, errorMessage, loadVaccineStockHistory } = useStock()

const vaccine = computed(() =>
  vaccines.value.find(item => item.id === vaccineId.value),
)

function goBackToStock(): void {
  void router.push('/admin/stock')
}
void Promise.all([loadVaccines(true), loadVaccineStockHistory(vaccineId.value)])

function performerName(entry: (typeof history.value)[number]): string {
  const user = entry.performedByUser

  if (!user) {
    return t('common.unknown')
  }

  return `${user.firstName} ${user.lastName}`
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">
          {{ t('admin.stock.history.title') }}
        </h2>
        <p v-if="vaccine" class="text-sm text-muted">{{ vaccine.name }}</p>
      </div>
      <UButton size="sm" variant="outline" @click="goBackToStock">
        {{ t('admin.stock.backToStock') }}
      </UButton>
    </div>

    <CommonLoadingSkeleton v-if="loading && history.length === 0" />

    <CommonErrorState
      v-else-if="errorMessage && history.length === 0"
      :title="t('admin.stock.history.loadFailed')"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="history.length === 0"
      :title="t('admin.stock.history.empty.title')"
      :description="t('admin.stock.history.empty.description')"
    />

    <div v-else class="space-y-4">
      <UCard v-for="entry in history" :key="entry.id">
        <div class="space-y-2 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-semibold">{{ entry.type }}</h3>
            <UBadge variant="subtle"
              >{{ entry.quantityDelta > 0 ? '+' : ''
              }}{{ entry.quantityDelta }}</UBadge
            >
          </div>
          <p>
            <span class="font-medium"
              >{{ t('admin.stock.history.date') }}:</span
            >
            {{ formatDateTime(entry.createdAt) }}
          </p>
          <p>
            <span class="font-medium"
              >{{ t('admin.stock.history.beforeAfter') }}:</span
            >
            {{
              t('admin.stock.history.beforeAfterValue', {
                before: entry.quantityBefore,
                after: entry.quantityAfter,
              })
            }}
          </p>
          <p>
            <span class="font-medium"
              >{{ t('admin.stock.history.reason') }}:</span
            >
            {{ entry.reason }}
          </p>
          <p>
            <span class="font-medium"
              >{{ t('admin.stock.history.performedBy') }}:</span
            >
            {{ performerName(entry) }}
          </p>
          <p v-if="entry.relatedOrderId">
            <span class="font-medium"
              >{{ t('admin.stock.history.relatedOrder') }}:</span
            >
            {{ entry.relatedOrderId }}
          </p>
        </div>
      </UCard>
    </div>
  </div>
</template>
