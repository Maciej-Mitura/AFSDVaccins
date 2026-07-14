<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import { UserRole } from '@vaccin-delivery/types'

import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'

const {
  currentUser,
  loading,
  loadCurrentUser,
  updateOwnUser,
  mapGraphQLError,
} = useCurrentUser()

const saving = ref(false)
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const schema = z.object({
  firstName: z.string().min(2, 'Voornaam moet minstens 2 tekens bevatten.'),
  lastName: z.string().min(2, 'Achternaam moet minstens 2 tekens bevatten.'),
})

type ProfileForm = z.output<typeof schema>

const state = reactive<Partial<ProfileForm>>({
  firstName: undefined,
  lastName: undefined,
})

const roleLabel = computed(() => {
  switch (currentUser.value?.role) {
    case UserRole.Admin:
      return 'Administrator'
    case UserRole.Bezorger:
      return 'Bezorger'
    default:
      return 'Apotheker'
  }
})

watch(
  currentUser,
  user => {
    if (!user) {
      return
    }

    state.firstName = user.firstName
    state.lastName = user.lastName
  },
  { immediate: true },
)

void loadCurrentUser()

async function onSubmit(event: FormSubmitEvent<ProfileForm>) {
  saving.value = true
  formError.value = null
  successMessage.value = null

  try {
    await updateOwnUser(event.data.firstName, event.data.lastName)
    successMessage.value = 'Profiel succesvol bijgewerkt.'
  } catch (error: unknown) {
    formError.value = mapGraphQLError(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Profiel</h2>
      </template>

      <CommonLoadingSkeleton v-if="loading" />

      <template v-else-if="currentUser">
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

        <div class="mb-4 space-y-2 text-sm">
          <p>
            <span class="font-medium">E-mail:</span>
            {{ currentUser.email }}
          </p>
          <p>
            <span class="font-medium">Rol:</span>
            {{ roleLabel }} ({{ currentUser.role }})
          </p>
        </div>

        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField label="Voornaam" name="firstName" required>
            <UInput v-model="state.firstName" class="w-full" />
          </UFormField>

          <UFormField label="Achternaam" name="lastName" required>
            <UInput v-model="state.lastName" class="w-full" />
          </UFormField>

          <UButton :loading="saving" type="submit">
            Wijzigingen opslaan
          </UButton>
        </UForm>
      </template>

      <CommonErrorState
        v-else
        title="Profiel niet beschikbaar"
        description="Log opnieuw in of voltooi je profiel."
      />
    </UCard>
  </div>
</template>
