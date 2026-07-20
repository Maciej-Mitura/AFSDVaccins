<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import { SelfRegistrationRole } from '@vaccin-delivery/types'
import * as z from 'zod'

import {
  getDefaultRouteForRole,
  useCurrentUser,
} from '@/composables/useCurrentUser'
import { useFirebase } from '@/composables/useFirebase'
import { useOnlineStatus } from '@/composables/useOnlineStatus'

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

const schema = z.object({
  firstName: z.string().min(2, 'Voornaam moet minstens 2 tekens bevatten.'),
  lastName: z.string().min(2, 'Achternaam moet minstens 2 tekens bevatten.'),
  email: z.string().email('Voer een geldig e-mailadres in.'),
  password: z.string().min(8, 'Wachtwoord moet minstens 8 tekens bevatten.'),
  role: z.enum(
    [SelfRegistrationRole.Apotheker, SelfRegistrationRole.Bezorger],
    { message: 'Kies een accounttype.' },
  ),
})

type RegisterForm = z.output<typeof schema>

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
      profileWarning.value =
        'Je Firebase-account is aangemaakt, maar het applicatieprofiel kon niet worden opgeslagen. Log in en kies opnieuw je accounttype via “Profiel aanvullen”.'
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
      Maakt een Firebase-account en een applicatieprofiel aan. Kies expliciet of
      je als apotheker of bezorger registreert.
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
      <UFormField label="Accounttype" name="role" required>
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
            <p class="font-medium">Apotheker</p>
            <p class="mt-1 text-sm text-muted">
              Ik plaats vaccinbestellingen voor een apotheek.
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
            <p class="font-medium">Bezorger</p>
            <p class="mt-1 text-sm text-muted">
              Ik lever geplande vaccinbestellingen.
            </p>
          </button>
        </div>
      </UFormField>

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

      <UButton :loading="loading" :disabled="!isOnline" block type="submit">
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
