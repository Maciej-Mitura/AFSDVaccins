<template>
  <div class="min-h-screen bg-default">
    <header class="border-b border-default bg-elevated">
      <div
        class="grid w-full items-center gap-x-3 px-4 py-3 grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)]"
        data-testid="app-shell-header"
      >
        <div class="min-w-0 justify-self-start" data-testid="app-shell-brand">
          <p
            class="text-[0.65rem] font-medium uppercase leading-tight tracking-wide text-muted"
          >
            {{ t('app.title') }}
          </p>
          <!-- Role-area label only; page content owns the document h1 via CommonPageHeader. -->
          <p
            class="text-base font-semibold leading-tight text-highlighted sm:text-lg"
            data-testid="app-shell-title"
          >
            {{ title }}
          </p>
        </div>

        <nav
          class="hidden justify-self-center lg:flex"
          :aria-label="t('navigation.main')"
          data-testid="app-shell-primary-nav"
        >
          <ul
            class="flex max-w-[min(100%,42rem)] flex-wrap items-center justify-center gap-1"
          >
            <li v-for="link in navigationLinks" :key="link.to">
              <UButton
                :to="link.to"
                size="sm"
                :variant="isActive(link.to) ? 'soft' : 'ghost'"
                :color="isActive(link.to) ? 'primary' : 'neutral'"
                :aria-current="isActive(link.to) ? 'page' : undefined"
                class="h-auto! min-h-8 whitespace-normal px-2 py-1.5 text-left leading-snug"
              >
                {{ link.label }}
              </UButton>
            </li>
          </ul>
        </nav>

        <div
          class="flex items-center justify-self-end gap-1"
          data-testid="app-shell-actions"
        >
          <nav
            class="flex flex-col items-end gap-1"
            :aria-label="t('navigation.account')"
            data-testid="app-shell-account-nav"
          >
            <div
              class="flex items-center gap-1"
              data-testid="app-shell-account-row"
            >
              <slot name="header-actions" />
              <UButton
                v-for="link in accountNavigationLinks"
                :key="link.to"
                :to="link.to"
                size="sm"
                :variant="isActive(link.to) ? 'soft' : 'ghost'"
                :color="isActive(link.to) ? 'primary' : 'neutral'"
                :aria-current="isActive(link.to) ? 'page' : undefined"
                class="hidden min-h-9 lg:inline-flex"
              >
                {{ link.label }}
              </UButton>
              <UButton
                v-if="isAuthenticated"
                color="neutral"
                size="sm"
                variant="outline"
                class="hidden min-h-9 lg:inline-flex"
                :loading="loggingOut"
                data-testid="logout-button"
                @click="onLogout"
              >
                {{ t('account.log.out') }}
              </UButton>
            </div>
            <div class="hidden max-w-36 self-end lg:block">
              <CommonLanguageSelector compact />
            </div>
          </nav>

          <UButton
            ref="menuToggleRef"
            class="min-h-11 min-w-11 lg:hidden"
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
            <UIcon name="i-lucide-menu" class="size-5" />
          </UButton>
        </div>
      </div>
    </header>

    <USlideover
      v-model:open="mobileMenuOpen"
      side="right"
      :title="title"
      :description="t('app.title')"
      :overlay="true"
      :transition="slideTransition"
      :close="{
        size: 'sm',
        color: 'neutral',
        variant: 'ghost',
        class: 'min-h-11 min-w-11',
      }"
      :content="mobileNavContentAttrs"
      :ui="{
        content: 'w-[min(88vw,22rem)] max-w-[22rem] shadow-sm',
        overlay: 'bg-default/75',
        body: 'flex flex-col gap-0 overflow-y-auto p-0',
        header: 'border-b border-default',
        title: 'text-highlighted',
        description: 'text-muted uppercase tracking-wide text-xs',
      }"
    >
      <template #close>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          class="min-h-11 min-w-11"
          :aria-label="t('navigation.closeMenu')"
          data-testid="app-shell-mobile-nav-close"
        />
      </template>
      <template #body="{ close }">
        <nav
          class="flex flex-col gap-1 px-3 py-3"
          :aria-label="t('navigation.main')"
          data-testid="app-shell-mobile-primary"
        >
          <ul class="flex flex-col gap-1">
            <li v-for="link in navigationLinks" :key="`mobile-${link.to}`">
              <UButton
                :to="link.to"
                block
                size="md"
                :variant="isActive(link.to) ? 'soft' : 'ghost'"
                :color="isActive(link.to) ? 'primary' : 'neutral'"
                :aria-current="isActive(link.to) ? 'page' : undefined"
                class="min-h-11 justify-start whitespace-normal text-left"
                @click="close"
              >
                {{ link.label }}
              </UButton>
            </li>
          </ul>
        </nav>

        <div
          class="mt-auto flex flex-col gap-1 border-t border-default px-3 py-3"
          data-testid="app-shell-mobile-utilities"
        >
          <UButton
            v-if="notificationNavigationLink"
            :to="notificationNavigationLink.to"
            block
            size="md"
            :variant="
              isActive(notificationNavigationLink.to) ? 'soft' : 'ghost'
            "
            :color="
              isActive(notificationNavigationLink.to) ? 'primary' : 'neutral'
            "
            :aria-current="
              isActive(notificationNavigationLink.to) ? 'page' : undefined
            "
            class="min-h-11 justify-start whitespace-normal text-left"
            data-testid="app-shell-mobile-notifications"
            @click="close"
          >
            {{ notificationNavigationLink.label }}
          </UButton>

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
                  class="min-h-11 justify-start whitespace-normal text-left"
                  @click="close"
                >
                  {{ link.label }}
                </UButton>
              </li>
            </ul>
          </nav>

          <div class="pt-1">
            <CommonLanguageSelector block />
          </div>

          <UButton
            v-if="isAuthenticated"
            block
            color="neutral"
            size="md"
            variant="outline"
            class="mt-1 min-h-11 justify-start"
            :loading="loggingOut"
            data-testid="logout-button-mobile"
            @click="onLogout"
          >
            {{ t('account.log.out') }}
          </UButton>
        </div>
      </template>
    </USlideover>

    <main class="mx-auto max-w-6xl px-4 py-6">
      <div class="mb-4">
        <CommonPushPermissionBanner />
      </div>
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
  notificationLink?: AppShellLink
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
const menuToggleRef = ref<{ $el?: HTMLElement } | null>(null)
const prefersReducedMotion = ref(false)
let motionMedia: MediaQueryList | null = null
let onMotionChange: ((event: MediaQueryListEvent) => void) | null = null

const navigationLinks = computed(() => props.navLinks ?? [])
const accountNavigationLinks = computed(() => props.accountLinks ?? [])
const notificationNavigationLink = computed(() => props.notificationLink)
const slideTransition = computed(() => !prefersReducedMotion.value)
const mobileNavContentAttrs = {
  id: 'app-shell-mobile-nav',
  'data-testid': 'app-shell-mobile-nav',
} as Record<string, string>

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

function focusMenuToggle() {
  const component = menuToggleRef.value as
    { $el?: HTMLElement } | HTMLElement | null
  const el =
    component && '$el' in component && component.$el
      ? component.$el
      : (component as HTMLElement | null)
  const focusTarget =
    el instanceof HTMLElement
      ? el.matches('button, [href], [tabindex]')
        ? el
        : el.querySelector<HTMLElement>('button, [href], [tabindex]')
      : null
  focusTarget?.focus()
}

function closeMobileMenu() {
  mobileMenuOpen.value = false
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

/**
 * Body scroll locking is owned by USlideover → Reka Dialog (modal=true).
 * Do not apply a competing document body overflow lock here — overlapping
 * locks can leave scroll disabled after close/navigation races on mobile.
 */
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && mobileMenuOpen.value) {
    closeMobileMenu()
  }
}

watch(
  () => route.fullPath,
  () => {
    closeMobileMenu()
  },
)

watch(mobileMenuOpen, (open, wasOpen) => {
  if (open) {
    document.addEventListener('keydown', onDocumentKeydown)
  } else {
    document.removeEventListener('keydown', onDocumentKeydown)
    if (wasOpen) {
      void nextTick(() => {
        focusMenuToggle()
      })
    }
  }
})

onMounted(() => {
  motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
  prefersReducedMotion.value = motionMedia.matches
  onMotionChange = (event: MediaQueryListEvent) => {
    prefersReducedMotion.value = event.matches
  }
  motionMedia.addEventListener('change', onMotionChange)

  setNotificationTranslate((key, values) => (values ? t(key, values) : t(key)))
  setNotificationToastOpenLabel(t('notifications.centre.openDetails'))
  setNotificationToastNavigate(path => {
    void router.push(path)
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
  closeMobileMenu()
  if (motionMedia && onMotionChange) {
    motionMedia.removeEventListener('change', onMotionChange)
  }
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
