<template>
  <div class="flex min-h-screen flex-col justify-center bg-primary-50 py-12">
    <div class="mx-auto w-full max-w-md px-4">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-semibold">{{ t('app.title') }}</h1>
        <p class="mt-1 text-sm text-muted">{{ t('app.auth.subtitle') }}</p>
        <div class="mt-4 flex justify-center">
          <CommonLanguageSelector />
        </div>
      </div>
      <RouterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import CommonLanguageSelector from '@/components/common/CommonLanguageSelector.vue'

const { t } = useI18n()
</script>
