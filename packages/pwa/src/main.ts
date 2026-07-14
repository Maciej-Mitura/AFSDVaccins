import { createApp, h, provide, ref } from 'vue'
import { DefaultApolloClient } from '@vue/apollo-composable'
import ui from '@nuxt/ui/vue-plugin'

import App from './App.vue'
import useGraphQL, {
  clearApolloCache,
  registerSessionExpiredHandler,
} from './composables/useGraphQL'
import { useFirebase } from './composables/useFirebase'
import router from './router'

import '@/assets/main.css'

const { waitForAuthRestoration, logout } = useFirebase()
const authReady = ref(false)

registerSessionExpiredHandler(async message => {
  await logout()
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
  await waitForAuthRestoration()
  authReady.value = true

  app.use(router)
  app.use(ui)
  app.mount('#app')
})()
