<template>
  <div class="min-h-screen bg-default">
    <header class="border-b border-default bg-elevated">
      <div
        class="mx-auto grid max-w-6xl grid-cols-[minmax(0,auto)_minmax(0,1fr)_minmax(0,auto)] items-center gap-3 px-4 py-3"
      >
        <div class="min-w-0">
          <p class="text-xs uppercase tracking-wide text-toned">
            {{ t('app.title') }}
          </p>
          <h1 class="truncate text-lg font-semibold text-highlighted">
            {{ title }}
          </h1>
        </div>

        <nav
          class="hidden justify-center md:flex"
          :aria-label="t('navigation.main')"
          data-testid="app-shell-primary-nav"
        >
          <ul
            class="flex max-w-full flex-wrap items-center justify-center gap-1"
          >
            <li v-for="link in navigationLinks" :key="link.to">
              <UButton
                :to="link.to"
                size="sm"
                :variant="isActive(link.to) ? 'soft' : 'ghost'"
                :color="isActive(link.to) ? 'primary' : 'neutral'"
                :aria-current="isActive(link.to) ? 'page' : undefined"
                class="max-w-40 truncate"
              >
                {{ link.label }}
              </UButton>
            </li>
          </ul>
        </nav>

        <div
          class="flex items-center justify-end gap-1 sm:gap-2"
          data-testid="app-shell-actions"
        >
          <slot name="header-actions" />

          <nav
            class="hidden items-center gap-1 md:flex"
            :aria-label="t('navigation.account')"
            data-testid="app-shell-account-nav"
          >
            <CommonLanguageSelector />
            <UButton
              v-for="link in accountNavigationLinks"
              :key="link.to"
              :to="link.to"
              size="sm"
              :variant="isActive(link.to) ? 'soft' : 'ghost'"
              :color="isActive(link.to) ? 'primary' : 'neutral'"
              :aria-current="isActive(link.to) ? 'page' : undefined"
            >
              {{ link.label }}
            </UButton>
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
          </nav>

          <UButton
            class="md:hidden"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="
              mobileMenuOpen
                ? t('navigation.closeMenu')
                : t('navigation.openMenu')
            "
            :aria-expanded="mobileMenuOpen ? 'true' : 'false'"
            aria-controls="app-shell-mobile-nav"
            data-testid="app-shell-menu-toggle"
            @click="toggleMobileMenu"
          >
            <UIcon
              :name="mobileMenuOpen ? 'i-lucide-x' : 'i-lucide-menu'"
              class="size-5"
            />
          </UButton>
        </div>
      </div>

      <div
        v-if="mobileMenuOpen"
        id="app-shell-mobile-nav"
        class="border-t border-default md:hidden"
        data-testid="app-shell-mobile-nav"
      >
        <div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3">
          <nav :aria-label="t('navigation.main')">
            <ul class="flex flex-col gap-1">
              <li v-for="link in navigationLinks" :key="`mobile-${link.to}`">
                <UButton
                  :to="link.to"
                  block
                  size="md"
                  :variant="isActive(link.to) ? 'soft' : 'ghost'"
                  :color="isActive(link.to) ? 'primary' : 'neutral'"
                  :aria-current="isActive(link.to) ? 'page' : undefined"
                  class="justify-start"
                  @click="closeMobileMenu"
                >
                  {{ link.label }}
                </UButton>
              </li>
            </ul>
          </nav>

          <div class="border-t border-default pt-3">
            <CommonLanguageSelector />
          </div>

          <nav :aria-label="t('navigation.account')">
            <ul class="flex flex-col gap-1">
              <li
                v-for="link in accountNavigationLinks"
                :key="`mobile-account-${link.to}`"
              >
                <UButton
                  :to="link.to"
                  block
                  size="md"
                  :variant="isActive(link.to) ? 'soft' : 'ghost'"
                  :color="isActive(link.to) ? 'primary' : 'neutral'"
                  :aria-current="isActive(link.to) ? 'page' : undefined"
                  class="justify-start"
                  @click="closeMobileMenu"
                >
                  {{ link.label }}
                </UButton>
              </li>
              <li v-if="isAuthenticated">
                <UButton
                  block
                  color="neutral"
                  size="md"
                  variant="outline"
                  class="justify-start"
                  :loading="loggingOut"
                  data-testid="logout-button-mobile"
                  @click="onLogout"
                >
                  {{ t('account.log.out') }}
                </UButton>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6">
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
import { useRoute, useRouter } from 'vue-router'

import CommonLanguageSelector from '@/components/common/CommonLanguageSelector.vue'
import CommonPushPermissionBanner from '@/components/common/CommonPushPermissionBanner.vue'
import { clearApolloCache } from '@/composables/useGraphQL'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useDeliveryRoutes } from '@/composables/useDeliveryRoutes'
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
  accountLinks?: AppShellLink[]
}>()

const route = useRoute()
const router = useRouter()
const { isAuthenticated, logout } = useFirebase()
const { clearCurrentUser } = useCurrentUser()
const { clearNotificationState } = useNotifications()
const { clearTodayRouteState } = useDeliveryRoutes()
const { resetSession: resetPushSession } = usePushNotifications()
const loggingOut = ref(false)
const mobileMenuOpen = ref(false)

const navigationLinks = computed(() => props.navLinks ?? [])
const accountNavigationLinks = computed(() => props.accountLinks ?? [])

const ROLE_ROOTS = new Set(['/admin', '/apotheker', '/bezorger'])

function isActive(to: string): boolean {
  const path = route.path
  if (path === to) {
    return true
  }
  if (ROLE_ROOTS.has(to)) {
    return false
  }
  return path.startsWith(`${to}/`)
}

function closeMobileMenu() {
  mobileMenuOpen.value = false
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

watch(
  () => route.fullPath,
  () => {
    closeMobileMenu()
  },
)

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
    clearTodayRouteState()
    clearNotificationToastState()
    resetPushSession()
    await clearApolloCache()
    closeMobileMenu()
    await router.push({ name: 'auth-login' })
  } finally {
    loggingOut.value = false
  }
}
</script>
