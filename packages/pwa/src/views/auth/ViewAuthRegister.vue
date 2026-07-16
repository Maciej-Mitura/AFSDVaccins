<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import { useCurrentUser } from '@/composables/useCurrentUser'
import { useFirebase } from '@/composables/useFirebase'

const router = useRouter()
const { register } = useFirebase()
const {
  createOwnUser,
  loadCurrentUser,
  mapGraphQLError,
} = useCurrentUser()

const loading = ref(false)
const formError = ref<string | null>(null)
const profileWarning = ref<string | null>(null)

const schema = z.object({
  firstName: z.string().min(2, 'Voornaam moet minstens 2 tekens bevatten.'),
  lastName: z.string().min(2, 'Achternaam moet minstens 2 tekens bevatten.'),
  email: z.string().email('Voer een geldig e-mailadres in.'),
  password: z.string().min(8, 'Wachtwoord moet minstens 8 tekens bevatten.'),
})

type RegisterForm = z.output<typeof schema>

const state = reactive<Partial<RegisterForm>>({
  firstName: undefined,
  lastName: undefined,
  email: undefined,
  password: undefined,
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
      await createOwnUser(event.data.firstName, event.data.lastName)
      await loadCurrentUser(true)
      await router.push('/auth/complete-profile')
    } catch (profileError: unknown) {
      profileWarning.value =
        'Je Firebase-account is aangemaakt, maar het applicatieprofiel kon niet worden opgeslagen. Log in en voltooi je profiel via “Profiel aanvullen”.'
      formError.value = mapGraphQLError(profileError)
    }
  } catch (error: unknown) {
    formError.value =
      error instanceof Error ? error.message : 'Registratie is mislukt.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">Registreren</h2>
    </template>

    <p class="mb-4 text-sm text-muted">
      Maakt een Firebase-account en een applicatieprofiel aan. Nieuwe accounts
      krijgen standaard de rol APOTHEKER.
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
      <UFormField label="Voornaam" name="firstName" required>
        <UInput
          v-model="state.firstName"
          autocomplete="given-name"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Achternaam" name="lastName" required>
        <UInput
          v-model="state.lastName"
          autocomplete="family-name"
          class="w-full"
        />
      </UFormField>

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
          autocomplete="new-password"
          class="w-full"
          type="password"
        />
      </UFormField>

      <UButton :loading="loading" block type="submit">
        Account aanmaken
      </UButton>
    </UForm>

    <p class="mt-4 text-center text-sm text-muted">
      Al een account?
      <RouterLink class="text-primary hover:underline" to="/auth/login">
        Inloggen
      </RouterLink>
    </p>
  </UCard>
</template>
