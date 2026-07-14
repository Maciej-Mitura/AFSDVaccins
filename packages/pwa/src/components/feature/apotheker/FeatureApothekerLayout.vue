<template>
  <CommonAppShell title="Apotheker" :nav-links="apothekerNavLinks">
    <RouterView />
  </CommonAppShell>
</template>

<script setup lang="ts">
import CommonAppShell, {
  type AppShellLink,
} from '@/components/common/CommonAppShell.vue'

const apothekerNavLinks: AppShellLink[] = [
  { label: 'Dashboard', to: '/apotheker' },
  { label: 'Vaccins', to: '/apotheker/vaccines' },
  { label: 'Profiel', to: '/profile' },
]
</script>
