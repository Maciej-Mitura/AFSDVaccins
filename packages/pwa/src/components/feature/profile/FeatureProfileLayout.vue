<template>
  <CommonAppShell :title="t('title.profile')">
    <RouterView />
  </CommonAppShell>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import CommonAppShell from '@/components/common/CommonAppShell.vue'

const { t } = useI18n()
</script>
