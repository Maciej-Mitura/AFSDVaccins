<template>
  <div class="mx-auto max-w-lg px-4 py-16 text-center">
    <UIcon
      name="i-lucide-shield-alert"
      class="mx-auto mb-4 size-10 text-warning"
    />
    <h1 class="text-2xl font-semibold text-highlighted">
      {{ t('common.permission.denied.title') }}
    </h1>
    <p class="mt-2 text-sm text-toned">
      {{ t('common.permission.denied.description') }}
    </p>
    <div class="mt-6">
      <UButton to="/auth/login" variant="soft" class="min-h-11">
        {{ t('common.go.login') }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
