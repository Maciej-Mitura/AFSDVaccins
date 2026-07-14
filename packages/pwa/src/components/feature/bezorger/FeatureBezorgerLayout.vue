<template>
  <CommonAppShell title="Bezorger" :nav-links="bezorgerNavLinks">
    <RouterView />
  </CommonAppShell>
</template>

<script setup lang="ts">
import CommonAppShell, {
  type AppShellLink,
} from '@/components/common/CommonAppShell.vue'

const bezorgerNavLinks: AppShellLink[] = [
  { label: 'Dashboard', to: '/bezorger' },
  { label: 'Profiel', to: '/profile' },
]
</script>
