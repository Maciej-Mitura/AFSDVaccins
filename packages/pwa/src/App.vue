<template>
  <UApp :toaster="{ position: 'top-right' }">
    <CommonPwaStatus />

    <div
      v-if="!authReady"
      class="flex min-h-screen items-center justify-center bg-default"
    >
      <CommonLoadingSkeleton />
    </div>

    <RouterView v-else />
  </UApp>
</template>

<script setup lang="ts">
import { inject, onMounted, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPwaStatus from '@/components/common/CommonPwaStatus.vue'
import {
  setNotificationToastApi,
  setNotificationToastNavigate,
  setNotificationToastOpenLabel,
} from '@/composables/useNotificationToast'
import { setNotificationTranslate } from '@/composables/useNotifications'

const authReady = inject<Ref<boolean>>('authReady')
const router = useRouter()
const { t } = useI18n()

onMounted(() => {
  // useToast is auto-imported by @nuxt/ui Vite plugin.
  setNotificationToastApi(useToast())
  setNotificationTranslate((key, values) => (values ? t(key, values) : t(key)))
  setNotificationToastOpenLabel(t('notifications.centre.openDetails'))
  setNotificationToastNavigate(path => {
    void router.push(path)
  })
})
</script>
