<template>
  <div class="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col gap-2 p-2 sm:p-3">
    <div
      v-if="!isOnline"
      class="pointer-events-auto rounded-md bg-warning-500 px-4 py-2 text-center text-sm text-white shadow"
      role="status"
      aria-live="polite"
      data-testid="pwa-offline-banner"
    >
      Je bent offline. Live gegevens en acties zijn tijdelijk niet beschikbaar.
    </div>

    <div
      v-else-if="showRestored"
      class="pointer-events-auto rounded-md bg-success-600 px-4 py-2 text-center text-sm text-white shadow"
      role="status"
      aria-live="polite"
      data-testid="pwa-online-banner"
    >
      Verbinding hersteld. Gegevens worden bijgewerkt…
    </div>

    <div
      v-if="needRefresh"
      class="pointer-events-auto mx-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-md border border-default bg-elevated px-4 py-2 text-sm shadow"
      role="status"
      aria-live="polite"
      data-testid="pwa-update-banner"
    >
      <span>Er is een nieuwe versie beschikbaar.</span>
      <div class="flex shrink-0 gap-2">
        <UButton size="xs" variant="ghost" color="neutral" @click="dismissUpdate">
          Later
        </UButton>
        <UButton size="xs" color="primary" @click="onApplyUpdate">
          Bijwerken
        </UButton>
      </div>
    </div>

    <div
      v-if="canInstall && !needRefresh"
      class="pointer-events-auto mx-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-md border border-default bg-elevated px-4 py-2 text-sm shadow"
      data-testid="pwa-install-banner"
    >
      <span>Installeer de app voor snellere toegang.</span>
      <UButton size="xs" color="primary" variant="soft" @click="onInstall">
        App installeren
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import { useAppInstall } from '@/composables/useAppInstall'
import { useAppUpdate } from '@/composables/useAppUpdate'
import { useOnlineStatus } from '@/composables/useOnlineStatus'

const { isOnline, lastReconnectedAt } = useOnlineStatus()
const { needRefresh, applyUpdate, dismissUpdate } = useAppUpdate()
const { canInstall, promptInstall } = useAppInstall()

const showRestored = ref(false)
let restoredTimer: ReturnType<typeof setTimeout> | null = null

watch(lastReconnectedAt, value => {
  if (value === null) {
    return
  }

  showRestored.value = true

  if (restoredTimer) {
    clearTimeout(restoredTimer)
  }

  restoredTimer = setTimeout(() => {
    showRestored.value = false
    restoredTimer = null
  }, 3500)
})

async function onApplyUpdate(): Promise<void> {
  await applyUpdate()
}

async function onInstall(): Promise<void> {
  await promptInstall()
}
</script>
