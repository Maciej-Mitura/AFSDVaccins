import { createApp, h, provide, ref } from 'vue'
import { DefaultApolloClient } from '@vue/apollo-composable'
import ui from '@nuxt/ui/vue-plugin'
import { registerSW } from 'virtual:pwa-register'

import App from './App.vue'
import useGraphQL, {
  clearApolloCache,
  registerSessionExpiredHandler,
} from './composables/useGraphQL'
import {
  configureAppUpdate,
  markAppOfflineReady,
  markAppUpdateAvailable,
} from './composables/useAppUpdate'
import { useCurrentUser } from './composables/useCurrentUser'
import { useFirebase } from './composables/useFirebase'
import { useNotifications } from './composables/useNotifications'
import { bootstrapI18n } from './i18n'
import router from './router'

import '@/assets/main.css'

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    markAppUpdateAvailable()
  },
  onOfflineReady() {
    markAppOfflineReady()
  },
})

configureAppUpdate({ updateServiceWorker })

const { waitForAuthRestoration, logout } = useFirebase()
const { clearCurrentUser } = useCurrentUser()
const { clearNotificationState } = useNotifications()
const authReady = ref(false)

registerSessionExpiredHandler(async message => {
  await logout()
  clearCurrentUser()
  clearNotificationState()
  const { clearNotificationToastState } =
    await import('./composables/useNotificationToast')
  const { usePushNotifications } =
    await import('./composables/usePushNotifications')
  clearNotificationToastState()
  usePushNotifications().resetSession()
  await clearApolloCache()
  await router.push({
    name: 'auth-login',
    query: { reason: 'session-expired', message },
  })
})

const app = createApp({
  setup() {
    const { apolloClient } = useGraphQL()
    provide(DefaultApolloClient, apolloClient)
    provide('authReady', authReady)
  },
  render: () => h(App),
})

void (async () => {
  try {
    await Promise.race([
      waitForAuthRestoration(),
      new Promise<void>(resolve => {
        window.setTimeout(resolve, 8000)
      }),
    ])
  } catch (error) {
    // Firebase may be unreachable; still mount so login / offline UI can render.
    if (import.meta.env.DEV) {
      console.error('[auth] restoration failed', error)
    }
  } finally {
    authReady.value = true
    // Teacher order: i18n before router. Auth restoration already ran above.
    const i18n = await bootstrapI18n()
    app.use(i18n)
    app.use(router)
    app.use(ui)
    app.mount('#app')
  }
})()
