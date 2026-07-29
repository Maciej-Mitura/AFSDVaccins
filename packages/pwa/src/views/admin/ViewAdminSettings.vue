<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import { useApplicationSettings } from '@/composables/useApplicationSettings'
import { useOnlineStatus } from '@/composables/useOnlineStatus'

const { t } = useI18n()
const { isOnline } = useOnlineStatus()

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

const schema = computed(() =>
  z.object({
    orderingClosingTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, t('validation.time.format')),
    weeklyWarningPercentage: z
      .number()
      .int(t('validation.integer'))
      .min(1, t('validation.percentage.min'))
      .max(100, t('validation.percentage.max')),
    weeklyDoseCap: z
      .number()
      .int(t('validation.integer'))
      .min(1, t('validation.doseCap.min'))
      .max(10000, t('validation.doseCap.max')),
    dailyDoseCapPerType: z
      .number()
      .int(t('validation.integer'))
      .min(1, t('validation.doseCap.min'))
      .max(10000, t('validation.doseCap.max')),
  }),
)

type SettingsForm = {
  orderingClosingTime: string
  weeklyWarningPercentage: number
  weeklyDoseCap: number
  dailyDoseCapPerType: number
}

const state = reactive<Partial<SettingsForm>>({
  orderingClosingTime: undefined,
  weeklyWarningPercentage: undefined,
  weeklyDoseCap: undefined,
  dailyDoseCapPerType: undefined,
})

void loadApplicationSettings().then(() => {
  if (!settings.value) {
    return
  }

  state.orderingClosingTime = settings.value.orderingClosingTime
  state.weeklyWarningPercentage = settings.value.weeklyWarningPercentage
  state.weeklyDoseCap = settings.value.weeklyDoseCap
  state.dailyDoseCapPerType = settings.value.dailyDoseCapPerType
})

async function onSubmit(event: FormSubmitEvent<SettingsForm>) {
  saving.value = true
  formError.value = null
  successMessage.value = null

  try {
    await updateApplicationSettings({
      orderingClosingTime: event.data.orderingClosingTime,
      weeklyWarningPercentage: event.data.weeklyWarningPercentage,
      weeklyDoseCap: event.data.weeklyDoseCap,
      dailyDoseCapPerType: event.data.dailyDoseCapPerType,
    })
    successMessage.value = t('success.settings.saved')
  } catch (error: unknown) {
    formError.value = mapGraphQLError(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <CommonPageHeader :title="t('settings.title')" />

    <CommonLoadingSkeleton v-if="loading && !settings" />

    <CommonErrorState
      v-else-if="errorMessage && !settings"
      :title="t('settings.loadFailed')"
      :description="errorMessage"
    />

    <CommonPageSection v-else-if="settings" variant="inset">
      <div class="space-y-6">
        <div class="space-y-2 text-sm">
          <p>
            <span class="font-medium text-highlighted"
              >{{ t('settings.timezone') }}:</span
            >
            {{ settings.timezone }}
          </p>
          <p class="text-muted">
            {{ t('settings.timezone.note') }}
          </p>
        </div>

        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            :label="t('settings.orderingClosingTime')"
            name="orderingClosingTime"
          >
            <UInput
              v-model="state.orderingClosingTime"
              placeholder="14:00"
              autocomplete="off"
            />
          </UFormField>

          <UFormField
            :label="t('settings.weeklyWarningPercentage')"
            name="weeklyWarningPercentage"
          >
            <UInput
              v-model.number="state.weeklyWarningPercentage"
              type="number"
              min="1"
              max="100"
            />
          </UFormField>

          <UFormField :label="t('settings.weeklyDoseCap')" name="weeklyDoseCap">
            <UInput
              v-model.number="state.weeklyDoseCap"
              type="number"
              min="1"
              max="10000"
            />
          </UFormField>

          <UFormField
            :label="t('settings.dailyDoseCap')"
            name="dailyDoseCapPerType"
          >
            <UInput
              v-model.number="state.dailyDoseCapPerType"
              type="number"
              min="1"
              max="10000"
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

          <UButton
            type="submit"
            class="min-h-11"
            :loading="saving"
            :disabled="!isOnline"
          >
            {{ t('common.save') }}
          </UButton>
        </UForm>
      </div>
    </CommonPageSection>
  </div>
</template>
