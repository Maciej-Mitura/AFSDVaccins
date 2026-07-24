<template>
  <CommonAppShell
    :title="t('shell.bezorger.title')"
    :nav-links="bezorgerNavLinks"
  >
    <RouterView />
  </CommonAppShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonAppShell, {
  type AppShellLink,
} from '@/components/common/CommonAppShell.vue'

const { t } = useI18n()

const bezorgerNavLinks = computed<AppShellLink[]>(() => [
  { label: t('navigation.bezorger.dashboard'), to: '/bezorger' },
  { label: t('navigation.bezorger.today'), to: '/bezorger/today' },
  { label: t('navigation.bezorger.tomorrow'), to: '/bezorger/tomorrow' },
  { label: t('navigation.bezorger.profile'), to: '/profile' },
])
</script>
