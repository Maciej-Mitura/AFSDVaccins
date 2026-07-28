<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold text-highlighted">
        {{ t('auth.login.title') }}
      </h2>
    </template>

    <UAlert
      v-if="sessionExpiredMessage"
      class="mb-4"
      color="warning"
      variant="subtle"
      :title="sessionExpiredMessage"
    />

    <UAlert
      v-if="!isOnline"
      class="mb-4"
      color="warning"
      variant="subtle"
      :title="t('auth.login.offline')"
      data-testid="login-offline-alert"
    />

    <UAlert
      v-else-if="formError"
      class="mb-4"
      color="error"
      variant="subtle"
      :title="formError"
    />

    <UForm
      :schema="schema"
      :state="state"
      class="space-y-4"
      data-testid="login-form"
      :data-e2e-auth-bypass="e2eAuthBypassEnabled ? 'true' : 'false'"
      @submit="onSubmit"
    >
      <UFormField :label="t('auth.login.email')" name="email" required>
        <UInput
          v-model="state.email"
          autocomplete="email"
          class="w-full"
          type="email"
          data-testid="login-email"
        />
      </UFormField>

      <UFormField :label="t('auth.login.password')" name="password" required>
        <UInput
          v-model="state.password"
          autocomplete="current-password"
          class="w-full"
          type="password"
          data-testid="login-password"
        />
      </UFormField>

      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <RouterLink
          class="text-sm text-toned underline-offset-2 hover:text-highlighted hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          to="/auth/forgot-password"
        >
          {{ t('auth.login.forgotPassword') }}
        </RouterLink>

        <UButton
          :loading="loading"
          :disabled="!isOnline"
          block
          type="submit"
          data-testid="login-submit"
        >
          {{ t('auth.login.submit') }}
        </UButton>
      </div>
    </UForm>

    <p class="mt-4 text-center text-sm text-toned">
      {{ t('auth.login.noAccount') }}
      <RouterLink
        class="font-medium text-primary underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        to="/auth/register"
      >
        {{ t('auth.login.register') }}
      </RouterLink>
    </p>
  </UCard>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import type * as z from 'zod'

import { useCurrentUser } from '@/composables/useCurrentUser'
import { useFirebase } from '@/composables/useFirebase'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { createLoginSchema } from '@/i18n'
import { shouldBlockLoginWhileOffline } from '@/views/auth/login-offline'
import { isE2eAuthBypassEnabled } from '@/firebase/e2e-auth-bypass'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { isOnline } = useOnlineStatus()
const { login } = useFirebase()
const { loadCurrentUser, getDefaultRouteForRole } = useCurrentUser()
const e2eAuthBypassEnabled = isE2eAuthBypassEnabled()

const loading = ref(false)
const formError = ref<string | null>(null)

const sessionExpiredMessage = computed(() =>
  route.query.reason === 'session-expired' ? t('auth.session.expired') : null,
)

const schema = computed(() => createLoginSchema(key => t(key)))

type LoginForm = z.output<ReturnType<typeof createLoginSchema>>

const state = reactive<Partial<LoginForm>>({
  email: undefined,
  password: undefined,
})

async function onSubmit(event: FormSubmitEvent<LoginForm>) {
  if (shouldBlockLoginWhileOffline(isOnline.value)) {
    formError.value = t('auth.login.offline')
    return
  }

  loading.value = true
  formError.value = null

  try {
    await login(event.data.email, event.data.password)
    await loadCurrentUser(true)

    const { role, needsProfileCompletion } = useCurrentUser()

    const redirect =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : needsProfileCompletion.value
          ? '/auth/complete-profile'
          : getDefaultRouteForRole(role.value)

    await router.push(redirect)
  } catch (error: unknown) {
    formError.value =
      error instanceof Error ? error.message : t('auth.login.failed')
  } finally {
    loading.value = false
  }
}
</script>
