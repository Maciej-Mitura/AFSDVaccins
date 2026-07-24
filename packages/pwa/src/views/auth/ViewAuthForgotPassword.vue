<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">
        {{ t('auth.forgotPassword.title') }}
      </h2>
    </template>

    <p class="mb-4 text-sm text-muted">
      {{ t('auth.forgotPassword.intro') }}
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
      <UFormField :label="t('auth.login.email')" name="email" required>
        <UInput
          v-model="state.email"
          autocomplete="email"
          class="w-full"
          type="email"
        />
      </UFormField>

      <UButton :loading="loading" block type="submit">
        {{ t('auth.forgotPassword.submit') }}
      </UButton>
    </UForm>

    <p class="mt-4 text-center text-sm text-muted">
      <RouterLink class="text-primary hover:underline" to="/auth/login">
        {{ t('common.back.login') }}
      </RouterLink>
    </p>
  </UCard>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { FormSubmitEvent } from '@nuxt/ui'
import type * as z from 'zod'

import { useFirebase } from '@/composables/useFirebase'
import { createForgotPasswordSchema } from '@/i18n'

const { t } = useI18n()
const { requestPasswordReset } = useFirebase()

const loading = ref(false)
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const schema = computed(() => createForgotPasswordSchema(key => t(key)))

type ForgotPasswordForm = z.output<
  ReturnType<typeof createForgotPasswordSchema>
>

const state = reactive<Partial<ForgotPasswordForm>>({
  email: undefined,
})

async function onSubmit(event: FormSubmitEvent<ForgotPasswordForm>) {
  loading.value = true
  formError.value = null
  successMessage.value = null

  try {
    await requestPasswordReset(event.data.email)
    successMessage.value = t('auth.forgotPassword.success')
  } catch (error: unknown) {
    formError.value =
      error instanceof Error ? error.message : t('auth.forgotPassword.failed')
  } finally {
    loading.value = false
  }
}
</script>
