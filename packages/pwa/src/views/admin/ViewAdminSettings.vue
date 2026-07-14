<script setup lang="ts">
import { reactive, ref } from 'vue'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useApplicationSettings } from '@/composables/useApplicationSettings'

const {
  settings,
  loading,
  errorMessage,
  loadApplicationSettings,
  updateApplicationSettings,
  mapGraphQLError,
} = useApplicationSettings()

const saving = ref(false)
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const schema = z.object({
  orderingClosingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Gebruik HH:mm formaat.'),
  weeklyWarningPercentage: z
    .number()
    .int('Moet een geheel getal zijn.')
    .min(1, 'Minimaal 1%.')
    .max(100, 'Maximaal 100%.'),
})

type SettingsForm = z.output<typeof schema>

const state = reactive<Partial<SettingsForm>>({
  orderingClosingTime: undefined,
  weeklyWarningPercentage: undefined,
})

void loadApplicationSettings().then(() => {
  if (!settings.value) {
    return
  }

  state.orderingClosingTime = settings.value.orderingClosingTime
  state.weeklyWarningPercentage = settings.value.weeklyWarningPercentage
})

async function onSubmit(event: FormSubmitEvent<SettingsForm>) {
  saving.value = true
  formError.value = null
  successMessage.value = null

  try {
    await updateApplicationSettings({
      orderingClosingTime: event.data.orderingClosingTime,
      weeklyWarningPercentage: event.data.weeklyWarningPercentage,
    })
    successMessage.value = 'Instellingen succesvol opgeslagen.'
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
        <h2 class="text-lg font-semibold">Applicatie-instellingen</h2>
      </template>

      <CommonLoadingSkeleton v-if="loading && !settings" />

      <CommonErrorState
        v-else-if="errorMessage && !settings"
        title="Instellingen laden mislukt"
        :description="errorMessage"
      />

      <div v-else-if="settings" class="space-y-6">
        <div class="space-y-2 text-sm">
          <p>
            <span class="font-medium">Tijdzone:</span>
            {{ settings.timezone }}
          </p>
          <p class="text-muted">
            De tijdzone is vastgelegd op Europe/Brussels voor deze fase.
          </p>
        </div>

        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            label="Sluitingstijd bestellingen"
            name="orderingClosingTime"
          >
            <UInput
              v-model="state.orderingClosingTime"
              placeholder="14:00"
              autocomplete="off"
            />
          </UFormField>

          <UFormField
            label="Wekelijkse waarschuwingsdrempel (%)"
            name="weeklyWarningPercentage"
          >
            <UInput
              v-model.number="state.weeklyWarningPercentage"
              type="number"
              min="1"
              max="100"
            />
          </UFormField>

          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />

          <UAlert
            v-if="successMessage"
            color="success"
            variant="subtle"
            :title="successMessage"
          />

          <UButton type="submit" :loading="saving">Opslaan</UButton>
        </UForm>
      </div>
    </UCard>
  </div>
</template>
