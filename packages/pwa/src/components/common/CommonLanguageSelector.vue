<template>
  <div class="flex items-center gap-2" :class="block ? 'w-full' : undefined">
    <label :id="labelId" class="sr-only">{{ languageLabel }}</label>
    <USelect
      v-model="selected"
      :items="items"
      :disabled="loading"
      :aria-labelledby="labelId"
      size="sm"
      :class="selectClass"
      data-testid="language-selector"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import { useLanguage } from '@/composables/useLanguage'
import type { SupportedLocale } from '@/i18n'

const props = withDefaults(
  defineProps<{
    /** Narrow control for desktop header utility row. */
    compact?: boolean
    /** Stretch to full available width (mobile drawer). */
    block?: boolean
  }>(),
  {
    compact: false,
    block: false,
  },
)

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

const selectClass = computed(() => {
  if (props.compact) {
    return 'min-w-[7.5rem] max-w-[9rem] w-full'
  }
  if (props.block) {
    return 'min-w-0 w-full'
  }
  return 'min-w-36'
})

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
