<template>
  <div class="flex items-center gap-2">
    <label :id="labelId" class="sr-only">{{ languageLabel }}</label>
    <USelect
      v-model="selected"
      :items="items"
      :disabled="loading"
      :aria-labelledby="labelId"
      size="sm"
      class="min-w-36"
      data-testid="language-selector"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import { useLanguage } from '@/composables/useLanguage'
import type { SupportedLocale } from '@/i18n'

const { t } = useI18n()
const {
  currentLocale,
  supportedLocales,
  supportedLocaleCodes,
  loading,
  setLocale,
} = useLanguage()

const labelId = useId()

const languageLabel = computed(() => t('label.language'))

const items = computed(() =>
  supportedLocaleCodes.map(code => ({
    value: code,
    label: supportedLocales[code].label,
  })),
)

const selected = computed({
  get: () => currentLocale.value,
  set: (value: string | undefined) => {
    if (!value || value === currentLocale.value) {
      return
    }
    void setLocale(value as SupportedLocale).catch(() => {
      // Error exposed via useLanguage().error
    })
  },
})
</script>
