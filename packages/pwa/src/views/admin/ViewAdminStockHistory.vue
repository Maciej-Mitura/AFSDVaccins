<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import { useStock } from '@/composables/useStock'
import { useVaccines } from '@/composables/useVaccines'
import { formatDateTime, stockAdjustmentTypeLabel } from '@/i18n'

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
  <div class="space-y-8">
    <CommonPageHeader
      :title="t('admin.stock.history.title')"
      :subtitle="vaccine?.name"
    >
      <template #actions>
        <UButton size="sm" variant="outline" @click="goBackToStock">
          {{ t('admin.stock.backToStock') }}
        </UButton>
      </template>
    </CommonPageHeader>

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

    <CommonPageSection v-else>
      <ul class="divide-y divide-default" role="list">
        <li
          v-for="entry in history"
          :key="entry.id"
          class="space-y-1.5 py-4 text-sm"
        >
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-semibold text-highlighted">
              {{ stockAdjustmentTypeLabel(entry.type) }}
            </h3>
            <UBadge
              :color="entry.quantityDelta > 0 ? 'success' : 'neutral'"
              variant="subtle"
            >
              {{ entry.quantityDelta > 0 ? '+' : '' }}{{ entry.quantityDelta }}
            </UBadge>
          </div>
          <p class="text-toned">
            <span class="font-medium text-highlighted"
              >{{ t('admin.stock.history.date') }}:</span
            >
            {{ formatDateTime(entry.createdAt) }}
          </p>
          <p class="text-toned">
            <span class="font-medium text-highlighted"
              >{{ t('admin.stock.history.beforeAfter') }}:</span
            >
            {{
              t('admin.stock.history.beforeAfterValue', {
                before: entry.quantityBefore,
                after: entry.quantityAfter,
              })
            }}
          </p>
          <p class="text-toned">
            <span class="font-medium text-highlighted"
              >{{ t('admin.stock.history.reason') }}:</span
            >
            {{ entry.reason }}
          </p>
          <p class="text-toned">
            <span class="font-medium text-highlighted"
              >{{ t('admin.stock.history.performedBy') }}:</span
            >
            {{ performerName(entry) }}
          </p>
          <p v-if="entry.relatedOrderId" class="text-toned">
            <span class="font-medium text-highlighted"
              >{{ t('admin.stock.history.relatedOrder') }}:</span
            >
            {{ entry.relatedOrderId }}
          </p>
        </li>
      </ul>
    </CommonPageSection>
  </div>
</template>
