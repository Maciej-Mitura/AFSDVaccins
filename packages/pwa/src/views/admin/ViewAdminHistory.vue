<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import FeatureOrderHistoryList from '@/components/feature/order-history/FeatureOrderHistoryList.vue'
import { useRouteTemplates } from '@/composables/useRouteTemplates'

const { t } = useI18n()
const { apothekerProfiles, loadProfileOptions, formatPharmacyLabel } =
  useRouteTemplates()

const pharmacyOptions = computed(() =>
  apothekerProfiles.value.map(profile => ({
    label: formatPharmacyLabel(profile),
    value: profile.userId,
  })),
)

onMounted(() => {
  void loadProfileOptions()
})
</script>

<template>
  <FeatureOrderHistoryList
    :title="t('admin.history.title')"
    :summary="t('admin.history.summary')"
    :show-pharmacy="true"
    :allow-apotheker-filter="true"
    :pharmacy-options="pharmacyOptions"
  />
</template>
