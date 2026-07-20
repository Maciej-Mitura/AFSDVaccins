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
    app.use(router)
    app.use(ui)
    app.mount('#app')
  }
})()
