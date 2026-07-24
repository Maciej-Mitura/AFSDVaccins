<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col gap-2 p-2 sm:p-3"
  >
    <div
      v-if="!isOnline"
      class="pointer-events-auto rounded-md bg-warning-500 px-4 py-2 text-center text-sm text-white shadow"
      role="status"
      aria-live="polite"
      data-testid="pwa-offline-banner"
    >
      {{ t('pwa.offline.message') }}
    </div>

    <div
      v-else-if="showRestored"
      class="pointer-events-auto rounded-md bg-success-600 px-4 py-2 text-center text-sm text-white shadow"
      role="status"
      aria-live="polite"
      data-testid="pwa-online-banner"
    >
      {{ t('pwa.online.restored') }}
    </div>

    <div
      v-if="needRefresh"
      class="pointer-events-auto mx-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-md border border-default bg-elevated px-4 py-2 text-sm shadow"
      role="status"
      aria-live="polite"
      data-testid="pwa-update-banner"
    >
      <span>{{ t('pwa.update.available') }}</span>
      <div class="flex shrink-0 gap-2">
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          @click="dismissUpdate"
        >
          {{ t('pwa.update.later') }}
        </UButton>
        <UButton size="xs" color="primary" @click="onApplyUpdate">
          {{ t('pwa.update.apply') }}
        </UButton>
      </div>
    </div>

    <div
      v-if="canInstall && !needRefresh"
      class="pointer-events-auto mx-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-md border border-default bg-elevated px-4 py-2 text-sm shadow"
      data-testid="pwa-install-banner"
    >
      <span>{{ t('pwa.install.message') }}</span>
      <UButton size="xs" color="primary" variant="soft" @click="onInstall">
        {{ t('pwa.install.action') }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAppInstall } from '@/composables/useAppInstall'
import { useAppUpdate } from '@/composables/useAppUpdate'
import { useOnlineStatus } from '@/composables/useOnlineStatus'

const { t } = useI18n()
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
