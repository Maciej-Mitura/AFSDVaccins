<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import VaccineImageThumbnail from '@/components/vaccines/VaccineImageThumbnail.vue'
import { useVaccines } from '@/composables/useVaccines'
import { translatePlural } from '@/i18n'

const { t } = useI18n()
const { activeVaccines, loading, errorMessage, loadVaccines } = useVaccines()

const searchQuery = ref('')

void loadVaccines(false)

async function refreshSignedUrls(): Promise<void> {
  await loadVaccines(false)
}

const filteredVaccines = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) {
    return activeVaccines.value
  }
  return activeVaccines.value.filter(vaccine => {
    const name = vaccine.name.toLowerCase()
    const manufacturer = vaccine.manufacturer.toLowerCase()
    return name.includes(query) || manufacturer.includes(query)
  })
})
</script>

<template>
  <div class="space-y-8" data-testid="apotheker-vaccines">
    <CommonPageHeader
      :title="t('vaccines.title')"
      :subtitle="t('apotheker.vaccines.description')"
    />

    <CommonPageSection variant="inset">
      <UFormField :label="t('apotheker.vaccines.searchPlaceholder')">
        <UInput
          v-model="searchQuery"
          type="search"
          :placeholder="t('apotheker.vaccines.searchPlaceholder')"
          data-testid="vaccine-catalogue-search"
          autocomplete="off"
        />
      </UFormField>
    </CommonPageSection>

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

    <CommonEmptyState
      v-else-if="filteredVaccines.length === 0"
      :title="t('apotheker.vaccines.empty.title')"
      :description="t('apotheker.vaccines.empty.description')"
    />

    <CommonPageSection v-else>
      <ul
        class="divide-y divide-default"
        role="list"
        data-testid="vaccine-catalogue-list"
      >
        <li
          v-for="vaccine in filteredVaccines"
          :key="vaccine.id"
          class="flex gap-3 py-4"
          data-testid="vaccine-catalogue-item"
        >
          <VaccineImageThumbnail
            :image="vaccine.image"
            :vaccine-name="vaccine.name"
            :on-url-expired="refreshSignedUrls"
          />
          <div class="min-w-0 flex-1 space-y-1.5 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold text-highlighted">{{ vaccine.name }}</h3>
              <UBadge color="success" variant="subtle">
                {{ t('status.available') }}
              </UBadge>
            </div>
            <p class="text-toned">
              {{ vaccine.description || t('common.noDescription') }}
            </p>
            <p class="text-toned">
              <span class="font-medium text-highlighted"
                >{{ t('vaccines.manufacturer') }}:</span
              >
              {{ vaccine.manufacturer }}
            </p>
            <div class="pt-1">
              <p class="text-xs font-medium uppercase tracking-wide text-toned">
                {{ t('vaccines.availableStock') }}
              </p>
              <p
                class="mt-0.5 text-lg font-semibold tabular-nums text-highlighted"
              >
                {{
                  translatePlural(
                    'admin.orders.totalDoses',
                    vaccine.stockQuantity,
                  )
                }}
              </p>
            </div>
          </div>
        </li>
      </ul>
    </CommonPageSection>
  </div>
</template>
