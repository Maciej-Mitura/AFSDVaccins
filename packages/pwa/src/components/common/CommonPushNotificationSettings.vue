<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { usePushNotifications } from '@/composables/usePushNotifications'

const { t } = useI18n()
const {
  status,
  errorMessage,
  busy,
  isEnabled,
  refresh,
  enableFromUserGesture,
  disableFromUserGesture,
} = usePushNotifications()

const feedback = ref<string | null>(null)
const feedbackTone = ref<'success' | 'error' | 'neutral'>('neutral')

const toggleModel = computed({
  get: () => isEnabled.value,
  set: (value: boolean) => {
    void onToggle(value)
  },
})

const statusDescription = computed(() => {
  switch (status.value) {
    case 'enabled':
      return t('notifications.push.status.enabled')
    case 'disabled':
      return t('notifications.push.status.disabled')
    case 'denied':
      return t('notifications.push.status.deniedGuidance')
    case 'unsupported':
      return t('notifications.push.status.unsupported')
    case 'unavailable':
      return t('notifications.push.status.unavailable')
    case 'requesting':
      return t('notifications.push.status.requesting')
    case 'error':
      return t('notifications.push.status.registerFailed')
    case 'prompt':
    default:
      return t('notifications.push.settings.description')
  }
})

const showDeniedGuidance = computed(() => status.value === 'denied')
const showRetry = computed(
  () => status.value === 'error' || status.value === 'disabled',
)

onMounted(() => {
  void refresh()
})

watch(status, () => {
  // Clear stale success copy when capability changes externally.
  if (status.value !== 'enabled' && feedbackTone.value === 'success') {
    feedback.value = null
  }
})

async function onToggle(enable: boolean): Promise<void> {
  feedback.value = null

  if (enable) {
    const ok = await enableFromUserGesture()
    if (ok) {
      feedbackTone.value = 'success'
      feedback.value = t('notifications.push.status.enabled')
    } else if (status.value === 'denied') {
      feedbackTone.value = 'error'
      feedback.value = t('notifications.push.status.deniedGuidance')
    } else {
      feedbackTone.value = 'error'
      feedback.value =
        errorMessage.value === 'VAPID_CONFIG'
          ? t('notifications.push.status.vapidConfig')
          : t('notifications.push.status.registerFailed')
    }
    return
  }

  const ok = await disableFromUserGesture()
  if (ok) {
    feedbackTone.value = 'neutral'
    feedback.value = t('notifications.push.status.disabled')
  } else {
    feedbackTone.value = 'error'
    feedback.value = t('notifications.push.status.disableFailed')
  }
}

async function onRetry(): Promise<void> {
  await onToggle(true)
}
</script>

<template>
  <section
    class="space-y-3 rounded-md bg-muted px-4 py-4"
    data-testid="push-notification-settings"
    :aria-label="t('notifications.push.settings.title')"
  >
    <div class="space-y-1">
      <h2 class="text-base font-semibold text-highlighted">
        {{ t('notifications.push.settings.title') }}
      </h2>
      <p class="text-sm text-toned">
        {{ t('notifications.push.settings.description') }}
      </p>
    </div>

    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1 text-sm">
        <p id="push-notifications-toggle-label" class="font-medium">
          {{ t('notifications.push.settings.toggle') }}
        </p>
        <p
          id="push-notifications-toggle-description"
          class="text-muted"
          data-testid="push-settings-status"
        >
          {{ statusDescription }}
        </p>
      </div>

      <USwitch
        v-model="toggleModel"
        :disabled="busy || status === 'unsupported' || status === 'unavailable'"
        :loading="busy"
        :aria-labelledby="'push-notifications-toggle-label'"
        :aria-describedby="'push-notifications-toggle-description'"
        data-testid="push-notifications-toggle"
      />
    </div>

    <UAlert
      v-if="showDeniedGuidance"
      color="warning"
      variant="subtle"
      :title="t('notifications.push.status.denied')"
      :description="t('notifications.push.status.deniedGuidance')"
    />

    <UAlert
      v-if="feedback"
      :color="
        feedbackTone === 'success'
          ? 'success'
          : feedbackTone === 'error'
            ? 'error'
            : 'neutral'
      "
      variant="subtle"
      :title="feedback"
      role="status"
      aria-live="polite"
    />

    <UButton
      v-if="showRetry"
      size="xs"
      variant="soft"
      color="primary"
      :loading="busy"
      data-testid="push-settings-retry"
      @click="onRetry"
    >
      {{ t('notifications.push.actions.retry') }}
    </UButton>
  </section>
</template>
