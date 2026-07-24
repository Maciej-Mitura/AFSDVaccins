<template>
  <UAlert
    color="warning"
    variant="subtle"
    icon="i-lucide-shield-alert"
    :title="t('common.permission.denied.title')"
    :description="description ?? t('common.permission.denied.description')"
  />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  description?: string
}>()

const { t } = useI18n()
</script>
