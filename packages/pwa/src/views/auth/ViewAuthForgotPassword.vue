<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">Wachtwoord vergeten</h2>
    </template>

    <p class="mb-4 text-sm text-muted">
      Vul je e-mailadres in. Firebase stuurt een resetlink als het account
      bestaat.
    </p>

    <UAlert
      v-if="successMessage"
      class="mb-4"
      color="success"
      variant="subtle"
      :title="successMessage"
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

      <UButton :loading="loading" block type="submit">
        Resetlink versturen
      </UButton>
    </UForm>

    <p class="mt-4 text-center text-sm text-muted">
      <RouterLink class="text-primary hover:underline" to="/auth/login">
        Terug naar inloggen
      </RouterLink>
    </p>
  </UCard>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import { useFirebase } from '@/composables/useFirebase'

const { requestPasswordReset } = useFirebase()

const loading = ref(false)
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const schema = z.object({
  email: z.string().email('Voer een geldig e-mailadres in.'),
})

type ForgotPasswordForm = z.output<typeof schema>

const state = reactive<Partial<ForgotPasswordForm>>({
  email: undefined,
})

async function onSubmit(event: FormSubmitEvent<ForgotPasswordForm>) {
  loading.value = true
  formError.value = null
  successMessage.value = null

  try {
    await requestPasswordReset(event.data.email)
    successMessage.value =
      'Als dit e-mailadres bij ons bekend is, ontvang je binnenkort een resetlink.'
  } catch (error: unknown) {
    formError.value =
      error instanceof Error
        ? error.message
        : 'Het versturen van de resetlink is mislukt.'
  } finally {
    loading.value = false
  }
}
</script>
