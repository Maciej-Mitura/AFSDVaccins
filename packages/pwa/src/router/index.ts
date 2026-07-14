import { createRouter, createWebHistory } from 'vue-router'

export type AppRole = 'APOTHEKER' | 'ADMIN' | 'BEZORGER'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    preventLoggedIn?: boolean
    role?: AppRole
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/admin',
    },
    {
      path: '/auth',
      component: () =>
        import('@/components/feature/auth/FeatureAuthLayout.vue'),
      meta: { preventLoggedIn: true },
      children: [
        {
          path: 'login',
          name: 'auth-login',
          component: () => import('@/views/auth/ViewAuthLogin.vue'),
        },
        {
          path: 'register',
          name: 'auth-register',
          component: () => import('@/views/auth/ViewAuthRegister.vue'),
        },
        {
          path: 'forgot-password',
          name: 'auth-forgot-password',
          component: () => import('@/views/auth/ViewAuthForgotPassword.vue'),
        },
      ],
    },
    {
      path: '/apotheker',
      component: () =>
        import('@/components/feature/apotheker/FeatureApothekerLayout.vue'),
      meta: { requiresAuth: true, role: 'APOTHEKER' },
      children: [
        {
          path: '',
          name: 'apotheker-dashboard',
          component: () =>
            import('@/views/apotheker/ViewApothekerDashboard.vue'),
        },
      ],
    },
    {
      path: '/admin',
      component: () =>
        import('@/components/feature/admin/FeatureAdminLayout.vue'),
      meta: { requiresAuth: true, role: 'ADMIN' },
      children: [
        {
          path: '',
          name: 'admin-dashboard',
          component: () => import('@/views/admin/ViewAdminDashboard.vue'),
        },
      ],
    },
    {
      path: '/bezorger',
      component: () =>
        import('@/components/feature/bezorger/FeatureBezorgerLayout.vue'),
      meta: { requiresAuth: true, role: 'BEZORGER' },
      children: [
        {
          path: '',
          name: 'bezorger-dashboard',
          component: () => import('@/views/bezorger/ViewBezorgerDashboard.vue'),
        },
      ],
    },
    {
      path: '/forbidden',
      name: 'forbidden',
      component: () => import('@/views/generic/ViewGenericForbidden.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/generic/ViewGeneric404.vue'),
    },
  ],
})

export default router
