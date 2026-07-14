<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">Registreren</h2>
    </template>

    <p class="mb-4 text-sm text-muted">
      Maakt alleen een Firebase-account aan. Roltoewijzing volgt in Phase 5.
    </p>

    <UAlert
      v-if="formError"
      class="mb-4"
      color="error"
      variant="subtle"
      :title="formError"
    />

    <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="Naam" name="displayName" required>
        <UInput
          v-model="state.displayName"
          autocomplete="name"
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

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import { useFirebase } from '@/composables/useFirebase'

const router = useRouter()
const { register } = useFirebase()

const loading = ref(false)
const formError = ref<string | null>(null)

const schema = z.object({
  displayName: z.string().min(2, 'Naam moet minstens 2 tekens bevatten.'),
  email: z.string().email('Voer een geldig e-mailadres in.'),
  password: z.string().min(8, 'Wachtwoord moet minstens 8 tekens bevatten.'),
})

type RegisterForm = z.output<typeof schema>

const state = reactive<Partial<RegisterForm>>({
  displayName: undefined,
  email: undefined,
  password: undefined,
})

async function onSubmit(event: FormSubmitEvent<RegisterForm>) {
  loading.value = true
  formError.value = null

  try {
    await register(
      event.data.displayName,
      event.data.email,
      event.data.password,
    )
    await router.push('/admin')
  } catch (error: unknown) {
    formError.value =
      error instanceof Error ? error.message : 'Registratie is mislukt.'
  } finally {
    loading.value = false
  }
}
</script>
