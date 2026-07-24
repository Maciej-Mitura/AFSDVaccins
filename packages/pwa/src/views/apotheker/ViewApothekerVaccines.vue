<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useVaccines } from '@/composables/useVaccines'
import { translatePlural } from '@/i18n'

const { t } = useI18n()
const { activeVaccines, loading, errorMessage, loadVaccines } = useVaccines()

void loadVaccines(false)
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('vaccines.title') }}</h2>
      </template>

      <p class="mb-4 text-sm text-muted">
        {{ t('apotheker.vaccines.description') }}
      </p>

      <CommonLoadingSkeleton v-if="loading && activeVaccines.length === 0" />

      <CommonErrorState
        v-else-if="errorMessage"
        :title="t('vaccines.loadFailed')"
        :description="errorMessage"
      />

      <CommonEmptyState
        v-else-if="activeVaccines.length === 0"
        :title="t('apotheker.vaccines.empty.title')"
        :description="t('apotheker.vaccines.empty.description')"
      />

      <div v-else class="space-y-4">
        <UCard v-for="vaccine in activeVaccines" :key="vaccine.id">
          <div class="space-y-2 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">{{ vaccine.name }}</h3>
              <UBadge color="success" variant="subtle">{{
                t('status.available')
              }}</UBadge>
            </div>
            <p>{{ vaccine.description || t('common.noDescription') }}</p>
            <p>
              <span class="font-medium">{{ t('vaccines.manufacturer') }}:</span>
              {{ vaccine.manufacturer }}
            </p>
            <p>
              <span class="font-medium"
                >{{ t('vaccines.availableStock') }}:</span
              >
              {{
                translatePlural(
                  'admin.orders.totalDoses',
                  vaccine.stockQuantity,
                )
              }}
            </p>
          </div>
        </UCard>
      </div>
    </UCard>
  </div>
</template>
