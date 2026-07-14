<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import { useCurrentUser } from '@/composables/useCurrentUser'

const route = useRoute()
const router = useRouter()
const { createOwnUser, mapGraphQLError, getDefaultRouteForRole } =
  useCurrentUser()

const loading = ref(false)
const formError = ref<string | null>(null)

const schema = z.object({
  firstName: z.string().min(2, 'Voornaam moet minstens 2 tekens bevatten.'),
  lastName: z.string().min(2, 'Achternaam moet minstens 2 tekens bevatten.'),
})

type CompleteProfileForm = z.output<typeof schema>

const state = reactive<Partial<CompleteProfileForm>>({
  firstName: undefined,
  lastName: undefined,
})

async function onSubmit(event: FormSubmitEvent<CompleteProfileForm>) {
  loading.value = true
  formError.value = null

  try {
    const user = await createOwnUser(event.data.firstName, event.data.lastName)

    const redirect =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : getDefaultRouteForRole(user.role)

    await router.push(redirect)
  } catch (error: unknown) {
    formError.value = mapGraphQLError(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">Profiel aanvullen</h2>
    </template>

    <p class="mb-4 text-sm text-muted">
      Je Firebase-account bestaat al, maar er is nog geen applicatieprofiel
      gekoppeld. Vul je gegevens aan om verder te gaan.
    </p>

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

      <UButton :loading="loading" block type="submit">
        Profiel opslaan
      </UButton>
    </UForm>
  </UCard>
</template>
