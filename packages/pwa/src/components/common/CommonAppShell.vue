<template>
  <div class="min-h-screen bg-default">
    <header class="border-b border-default bg-elevated">
      <div
        class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p class="text-xs uppercase tracking-wide text-muted">
            {{ t('app.title') }}
          </p>
          <h1 class="text-lg font-semibold">{{ title }}</h1>
        </div>
        <nav :aria-label="t('navigation.main')">
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-for="link in navigationLinks"
              :key="link.to"
              :to="link.to"
              size="sm"
              variant="ghost"
              color="neutral"
            >
              {{ link.label }}
            </UButton>
            <CommonLanguageSelector />
            <slot name="header-actions" />
            <UButton
              v-if="isAuthenticated"
              color="neutral"
              size="sm"
              variant="outline"
              :loading="loggingOut"
              data-testid="logout-button"
              @click="onLogout"
            >
              {{ t('account.log.out') }}
            </UButton>
          </div>
        </nav>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-6">
      <div class="mb-4">
        <CommonPushPermissionBanner />
      </div>
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import CommonLanguageSelector from '@/components/common/CommonLanguageSelector.vue'
import CommonPushPermissionBanner from '@/components/common/CommonPushPermissionBanner.vue'
import { clearApolloCache } from '@/composables/useGraphQL'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useFirebase } from '@/composables/useFirebase'
import {
  setNotificationToastNavigate,
  setNotificationToastOpenLabel,
  clearNotificationToastState,
} from '@/composables/useNotificationToast'
import {
  setNotificationTranslate,
  useNotifications,
} from '@/composables/useNotifications'
import { usePushNotifications } from '@/composables/usePushNotifications'

const { t } = useI18n()

export type AppShellLink = {
  label: string
  to: string
}

const props = defineProps<{
  title: string
  navLinks?: AppShellLink[]
}>()

const router = useRouter()
const { isAuthenticated, logout } = useFirebase()
const { clearCurrentUser } = useCurrentUser()
const { clearNotificationState } = useNotifications()
const { resetSession: resetPushSession } = usePushNotifications()
const loggingOut = ref(false)

const navigationLinks = computed(() => props.navLinks ?? [])

onMounted(() => {
  setNotificationTranslate((key, values) => (values ? t(key, values) : t(key)))
  setNotificationToastOpenLabel(t('notifications.centre.openDetails'))
  setNotificationToastNavigate(path => {
    void router.push(path)
  })
})

watch(
  () => t('notifications.centre.openDetails'),
  label => {
    setNotificationToastOpenLabel(label)
  },
)

async function onLogout() {
  loggingOut.value = true

  try {
    await logout()
    clearCurrentUser()
    clearNotificationState()
    clearNotificationToastState()
    resetPushSession()
    await clearApolloCache()
    await router.push({ name: 'auth-login' })
  } finally {
    loggingOut.value = false
  }
}
</script>
