<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import { SelfRegistrationRole } from '@vaccin-delivery/types'
import type * as z from 'zod'

import {
  getDefaultRouteForRole,
  useCurrentUser,
} from '@/composables/useCurrentUser'
import { useFirebase } from '@/composables/useFirebase'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { createRegisterSchema } from '@/i18n'

const { t } = useI18n()
const router = useRouter()
const { isOnline } = useOnlineStatus()
const { register } = useFirebase()
const {
  createOwnUser,
  loadCurrentUser,
  mapGraphQLError,
  needsProfileCompletion,
} = useCurrentUser()

const loading = ref(false)
const formError = ref<string | null>(null)
const profileWarning = ref<string | null>(null)

const schema = computed(() => createRegisterSchema(key => t(key)))

type RegisterForm = z.output<ReturnType<typeof createRegisterSchema>>

const state = reactive<Partial<RegisterForm>>({
  firstName: undefined,
  lastName: undefined,
  email: undefined,
  password: undefined,
  role: undefined,
})

async function onSubmit(event: FormSubmitEvent<RegisterForm>) {
  loading.value = true
  formError.value = null
  profileWarning.value = null

  try {
    await register(
      `${event.data.firstName} ${event.data.lastName}`,
      event.data.email,
      event.data.password,
    )

    try {
      const user = await createOwnUser(
        event.data.firstName,
        event.data.lastName,
        event.data.role,
      )
      await loadCurrentUser(true)

      if (needsProfileCompletion.value) {
        await router.push('/auth/complete-profile')
      } else {
        await router.push(getDefaultRouteForRole(user.role))
      }
    } catch (profileError: unknown) {
      profileWarning.value = t('auth.register.profileWarning')
      formError.value = mapGraphQLError(profileError)
    }
  } catch (error: unknown) {
    formError.value =
      error instanceof Error ? error.message : t('auth.register.failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">{{ t('auth.register.title') }}</h2>
    </template>

    <p class="mb-4 text-sm text-muted">
      {{ t('auth.register.intro') }}
    </p>

    <UAlert
      v-if="profileWarning"
      class="mb-4"
      color="warning"
      variant="subtle"
      :title="profileWarning"
    />

    <UAlert
      v-if="formError"
      class="mb-4"
      color="error"
      variant="subtle"
      :title="formError"
    />

    <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField :label="t('auth.register.accountType')" name="role" required>
        <div class="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            class="rounded-lg border px-3 py-3 text-left transition"
            :class="
              state.role === SelfRegistrationRole.Apotheker
                ? 'border-primary bg-primary/5'
                : 'border-default hover:border-primary/40'
            "
            @click="state.role = SelfRegistrationRole.Apotheker"
          >
            <p class="font-medium">{{ t('shell.apotheker.title') }}</p>
            <p class="mt-1 text-sm text-muted">
              {{ t('auth.register.role.apotheker.description') }}
            </p>
          </button>

          <button
            type="button"
            class="rounded-lg border px-3 py-3 text-left transition"
            :class="
              state.role === SelfRegistrationRole.Bezorger
                ? 'border-primary bg-primary/5'
                : 'border-default hover:border-primary/40'
            "
            @click="state.role = SelfRegistrationRole.Bezorger"
          >
            <p class="font-medium">{{ t('shell.bezorger.title') }}</p>
            <p class="mt-1 text-sm text-muted">
              {{ t('auth.register.role.bezorger.description') }}
            </p>
          </button>
        </div>
      </UFormField>

      <UFormField :label="t('label.first.name')" name="firstName" required>
        <UInput
          v-model="state.firstName"
          autocomplete="given-name"
          class="w-full"
        />
      </UFormField>

      <UFormField :label="t('label.last.name')" name="lastName" required>
        <UInput
          v-model="state.lastName"
          autocomplete="family-name"
          class="w-full"
        />
      </UFormField>

      <UFormField :label="t('auth.login.email')" name="email" required>
        <UInput
          v-model="state.email"
          autocomplete="email"
          class="w-full"
          type="email"
        />
      </UFormField>

      <UFormField :label="t('auth.login.password')" name="password" required>
        <UInput
          v-model="state.password"
          autocomplete="new-password"
          class="w-full"
          type="password"
        />
      </UFormField>

      <UButton :loading="loading" :disabled="!isOnline" block type="submit">
        {{ t('auth.register.submit') }}
      </UButton>
    </UForm>

    <p class="mt-4 text-center text-sm text-muted">
      {{ t('auth.register.hasAccount') }}
      <RouterLink class="text-primary hover:underline" to="/auth/login">
        {{ t('auth.login.submit') }}
      </RouterLink>
    </p>
  </UCard>
</template>
