<template>
  <div class="min-h-screen bg-default">
    <header class="border-b border-default bg-elevated">
      <div
        class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p class="text-xs uppercase tracking-wide text-muted">
            Vaccinatie-levering
          </p>
          <h1 class="text-lg font-semibold">{{ title }}</h1>
        </div>
        <nav aria-label="Ontwikkel-navigatie">
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-for="link in devLinks"
              :key="link.to"
              :to="link.to"
              size="sm"
              variant="ghost"
              color="neutral"
            >
              {{ link.label }}
            </UButton>
            <UButton
              v-if="isAuthenticated"
              color="neutral"
              size="sm"
              variant="outline"
              :loading="loggingOut"
              @click="onLogout"
            >
              Uitloggen
            </UButton>
          </div>
        </nav>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { clearApolloCache } from '@/composables/useGraphQL'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useFirebase } from '@/composables/useFirebase'

defineProps<{
  title: string
}>()

const router = useRouter()
const { isAuthenticated, logout } = useFirebase()
const { clearCurrentUser } = useCurrentUser()
const loggingOut = ref(false)

const devLinks = [
  { label: 'Profiel', to: '/profile' },
  { label: 'Apotheker', to: '/apotheker' },
  { label: 'Admin', to: '/admin' },
  { label: 'Bezorger', to: '/bezorger' },
]

async function onLogout() {
  loggingOut.value = true

  try {
    await logout()
    clearCurrentUser()
    await clearApolloCache()
    await router.push({ name: 'auth-login' })
  } finally {
    loggingOut.value = false
  }
}
</script>
