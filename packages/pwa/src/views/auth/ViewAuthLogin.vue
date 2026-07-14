<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">Inloggen</h2>
    </template>

    <UAlert
      v-if="sessionExpiredMessage"
      class="mb-4"
      color="warning"
      variant="subtle"
      :title="sessionExpiredMessage"
    />

    <UAlert
      v-if="formError"
      class="mb-4"
      color="error"
      variant="subtle"
      :title="formError"
    />

    <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="E-mailadres" name="email" required>
        <UInput
          v-model="state.email"
          autocomplete="email"
          class="w-full"
          type="email"
        />
      </UFormField>

      <UFormField label="Wachtwoord" name="password" required>
        <UInput
          v-model="state.password"
          autocomplete="current-password"
          class="w-full"
          type="password"
        />
      </UFormField>

      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <RouterLink
          class="text-sm text-primary hover:underline"
          to="/auth/forgot-password"
        >
          Wachtwoord vergeten?
        </RouterLink>

        <UButton :loading="loading" block type="submit"> Inloggen </UButton>
      </div>
    </UForm>

    <p class="mt-4 text-center text-sm text-muted">
      Nog geen account?
      <RouterLink class="text-primary hover:underline" to="/auth/register">
        Registreren
      </RouterLink>
    </p>
  </UCard>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import { useCurrentUser } from '@/composables/useCurrentUser'
import { useFirebase } from '@/composables/useFirebase'

const route = useRoute()
const router = useRouter()
const { login } = useFirebase()
const { loadCurrentUser, getDefaultRouteForRole } = useCurrentUser()

const loading = ref(false)
const formError = ref<string | null>(null)

const sessionExpiredMessage = computed(() =>
  route.query.reason === 'session-expired'
    ? 'Uw sessie is verlopen. Log opnieuw in.'
    : null,
)

const schema = z.object({
  email: z.string().email('Voer een geldig e-mailadres in.'),
  password: z.string().min(8, 'Wachtwoord moet minstens 8 tekens bevatten.'),
})

type LoginForm = z.output<typeof schema>

const state = reactive<Partial<LoginForm>>({
  email: undefined,
  password: undefined,
})

async function onSubmit(event: FormSubmitEvent<LoginForm>) {
  loading.value = true
  formError.value = null

  try {
    await login(event.data.email, event.data.password)
    await loadCurrentUser(true)

    const { role, missingProfile } = useCurrentUser()

    const redirect =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : missingProfile.value
          ? '/auth/complete-profile'
          : getDefaultRouteForRole(role.value)

    await router.push(redirect)
  } catch (error: unknown) {
    formError.value =
      error instanceof Error ? error.message : 'Inloggen is mislukt.'
  } finally {
    loading.value = false
  }
}
</script>
