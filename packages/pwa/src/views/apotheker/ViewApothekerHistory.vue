<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import FeatureOrderHistoryList from '@/components/feature/order-history/FeatureOrderHistoryList.vue'

const { t } = useI18n()
</script>

<template>
  <FeatureOrderHistoryList
    :title="t('apotheker.history.title')"
    :summary="t('apotheker.history.summary')"
    :show-pharmacy="false"
    :allow-apotheker-filter="false"
  />
</template>
