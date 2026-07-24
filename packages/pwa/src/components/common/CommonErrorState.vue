<template>
  <UAlert
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="resolvedTitle"
    :description="resolvedDescription"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  title?: string
  description?: string
}>()

const { t } = useI18n()

const resolvedTitle = computed(() => props.title ?? t('common.error.title'))
const resolvedDescription = computed(
  () => props.description ?? t('common.error.description'),
)
</script>
