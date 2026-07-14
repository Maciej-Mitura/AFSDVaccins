import { createApp, h, provide } from 'vue'
import { DefaultApolloClient } from '@vue/apollo-composable'
import ui from '@nuxt/ui/vue-plugin'

import App from './App.vue'
import useGraphQL from './composables/useGraphQL'
import router from './router'

import '@/assets/main.css'

const app = createApp({
  setup() {
    const { apolloClient } = useGraphQL()
    provide(DefaultApolloClient, apolloClient)
  },
  render: () => h(App),
})

app.use(router)
app.use(ui)
app.mount('#app')
