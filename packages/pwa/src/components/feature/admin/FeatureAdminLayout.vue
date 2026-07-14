<template>
  <CommonAppShell title="Administratie" :nav-links="adminNavLinks">
    <RouterView />
  </CommonAppShell>
</template>

<script setup lang="ts">
import CommonAppShell, {
  type AppShellLink,
} from '@/components/common/CommonAppShell.vue'

const adminNavLinks: AppShellLink[] = [
  { label: 'Dashboard', to: '/admin' },
  { label: 'Bestellingen', to: '/admin/orders' },
  { label: 'Vaccins', to: '/admin/vaccines' },
  { label: 'Instellingen', to: '/admin/settings' },
  { label: 'Profiel', to: '/profile' },
]
</script>
