<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  dismissPostLoginPushBanner,
  shouldShowPostLoginPushBanner,
} from '@/composables/usePushPermissionPrompt'
import { usePushNotifications } from '@/composables/usePushNotifications'
import { useFirebase } from '@/composables/useFirebase'

const { t } = useI18n()
const router = useRouter()
const { isAuthenticated } = useFirebase()
const { status, permission, capability, busy, refresh, enableFromUserGesture } =
  usePushNotifications()

const visible = ref(false)
const enabling = ref(false)
const statusMessage = ref<string | null>(null)

const supportsPush = computed(
  () => status.value !== 'unsupported' && status.value !== 'unavailable',
)

async function recomputeVisibility(): Promise<void> {
  if (!isAuthenticated.value) {
    visible.value = false
    return
  }

  await refresh()

  visible.value = shouldShowPostLoginPushBanner({
    isAuthenticated: isAuthenticated.value,
    permission: permission.value,
    supportsPush: supportsPush.value,
    hasActiveSubscription: capability.value?.enabled === true,
  })
}

onMounted(() => {
  void recomputeVisibility()
})

watch(isAuthenticated, value => {
  if (value) {
    void recomputeVisibility()
  } else {
    visible.value = false
  }
})

async function onEnable(): Promise<void> {
  enabling.value = true
  statusMessage.value = null

  try {
    const ok = await enableFromUserGesture()
    if (ok) {
      statusMessage.value = t('notifications.push.status.enabled')
      visible.value = false
    } else if (permission.value === 'denied') {
      statusMessage.value = t('notifications.push.status.deniedGuidance')
      visible.value = false
    } else {
      statusMessage.value = t('notifications.push.status.registerFailed')
    }
  } finally {
    enabling.value = false
  }
}

function onDismiss(): void {
  dismissPostLoginPushBanner()
  visible.value = false
}

function onOpenSettings(): void {
  void router.push('/profile')
}
</script>

<template>
  <div
    v-if="visible"
    class="pointer-events-auto mx-auto flex w-full max-w-lg flex-col gap-3 rounded-md border border-default bg-elevated px-4 py-3 text-sm shadow"
    role="region"
    :aria-label="t('notifications.push.permission.banner.title')"
    data-testid="push-permission-banner"
  >
    <div class="space-y-1">
      <p class="font-medium">
        {{ t('notifications.push.permission.banner.title') }}
      </p>
      <p class="text-muted">
        {{ t('notifications.push.permission.banner.body') }}
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton
        size="xs"
        color="primary"
        :loading="enabling || busy"
        data-testid="push-permission-enable"
        @click="onEnable"
      >
        {{ t('notifications.push.permission.enable') }}
      </UButton>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        data-testid="push-permission-dismiss"
        @click="onDismiss"
      >
        {{ t('notifications.push.permission.dismiss') }}
      </UButton>
      <UButton size="xs" variant="soft" color="neutral" @click="onOpenSettings">
        {{ t('notifications.push.settings.title') }}
      </UButton>
    </div>

    <p
      v-if="statusMessage"
      class="text-xs text-muted"
      role="status"
      aria-live="polite"
    >
      {{ statusMessage }}
    </p>
  </div>
</template>
