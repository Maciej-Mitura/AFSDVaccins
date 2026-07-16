import { createRouter, createWebHistory } from 'vue-router'

import { UserRole } from '@vaccin-delivery/types'

import {
  useCurrentUser,
  getDefaultRouteForRole,
} from '@/composables/useCurrentUser'
import { useFirebase } from '@/composables/useFirebase'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    preventLoggedIn?: boolean
    requiresProfile?: boolean
    role?: UserRole
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: () => {
        const { isAuthenticated } = useFirebase()
        const { isRegistered, role, needsProfileCompletion } = useCurrentUser()

        if (!isAuthenticated.value) {
          return '/auth/login'
        }

        if (!isRegistered.value || needsProfileCompletion.value) {
          return '/auth/complete-profile'
        }

        return getDefaultRouteForRole(role.value)
      },
    },
    {
      path: '/auth',
      component: () =>
        import('@/components/feature/auth/FeatureAuthLayout.vue'),
      children: [
        {
          path: 'login',
          name: 'auth-login',
          meta: { preventLoggedIn: true },
          component: () => import('@/views/auth/ViewAuthLogin.vue'),
        },
        {
          path: 'register',
          name: 'auth-register',
          meta: { preventLoggedIn: true },
          component: () => import('@/views/auth/ViewAuthRegister.vue'),
        },
        {
          path: 'forgot-password',
          name: 'auth-forgot-password',
          meta: { preventLoggedIn: true },
          component: () => import('@/views/auth/ViewAuthForgotPassword.vue'),
        },
        {
          path: 'complete-profile',
          name: 'auth-complete-profile',
          meta: { requiresAuth: true, requiresProfile: false },
          component: () => import('@/views/auth/ViewAuthCompleteProfile.vue'),
        },
      ],
    },
    {
      path: '/profile',
      name: 'profile',
      component: () =>
        import('@/components/feature/profile/FeatureProfileLayout.vue'),
      meta: { requiresAuth: true, requiresProfile: true },
      children: [
        {
          path: '',
          component: () => import('@/views/profile/ViewProfile.vue'),
        },
      ],
    },
    {
      path: '/apotheker',
      component: () =>
        import('@/components/feature/apotheker/FeatureApothekerLayout.vue'),
      meta: {
        requiresAuth: true,
        requiresProfile: true,
        role: UserRole.Apotheker,
      },
      children: [
        {
          path: '',
          name: 'apotheker-dashboard',
          component: () =>
            import('@/views/apotheker/ViewApothekerDashboard.vue'),
        },
        {
          path: 'vaccines',
          name: 'apotheker-vaccines',
          component: () =>
            import('@/views/apotheker/ViewApothekerVaccines.vue'),
        },
        {
          path: 'orders/new',
          name: 'apotheker-create-order',
          component: () =>
            import('@/views/apotheker/ViewApothekerCreateOrder.vue'),
        },
        {
          path: 'orders',
          name: 'apotheker-orders',
          component: () => import('@/views/apotheker/ViewApothekerOrders.vue'),
        },
        {
          path: 'notifications',
          name: 'apotheker-notifications',
          component: () =>
            import('@/views/apotheker/ViewApothekerNotifications.vue'),
        },
      ],
    },
    {
      path: '/admin',
      component: () =>
        import('@/components/feature/admin/FeatureAdminLayout.vue'),
      meta: { requiresAuth: true, requiresProfile: true, role: UserRole.Admin },
      children: [
        {
          path: '',
          name: 'admin-dashboard',
          component: () => import('@/views/admin/ViewAdminDashboard.vue'),
        },
        {
          path: 'settings',
          name: 'admin-settings',
          component: () => import('@/views/admin/ViewAdminSettings.vue'),
        },
        {
          path: 'vaccines',
          name: 'admin-vaccines',
          component: () => import('@/views/admin/ViewAdminVaccines.vue'),
        },
        {
          path: 'stock',
          name: 'admin-stock',
          component: () => import('@/views/admin/ViewAdminStock.vue'),
        },
        {
          path: 'stock/:vaccineId/history',
          name: 'admin-stock-history',
          component: () => import('@/views/admin/ViewAdminStockHistory.vue'),
        },
        {
          path: 'notifications',
          name: 'admin-notifications',
          component: () => import('@/views/admin/ViewAdminNotifications.vue'),
        },
        {
          path: 'orders',
          name: 'admin-orders',
          component: () => import('@/views/admin/ViewAdminOrders.vue'),
        },
      ],
    },
    {
      path: '/bezorger',
      component: () =>
        import('@/components/feature/bezorger/FeatureBezorgerLayout.vue'),
      meta: {
        requiresAuth: true,
        requiresProfile: true,
        role: UserRole.Bezorger,
      },
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

router.beforeEach(async to => {
  const { firebaseUser, waitForAuthRestoration } = useFirebase()
  const {
    loadCurrentUser,
    loading: userLoading,
    initialized: userInitialized,
    isRegistered,
    missingProfile,
    needsProfileCompletion,
    role,
    getDefaultRouteForRole: getRouteForRole,
  } = useCurrentUser()

  await waitForAuthRestoration()

  const isAuthenticated = firebaseUser.value !== null

  if (to.meta.requiresAuth && !isAuthenticated) {
    return {
      name: 'auth-login',
      query: { redirect: to.fullPath },
    }
  }

  if (isAuthenticated) {
    if (!userInitialized.value && !userLoading.value) {
      try {
        await loadCurrentUser()
      } catch {
        if (to.name !== 'auth-login') {
          return { name: 'auth-login' }
        }
      }
    } else if (userLoading.value) {
      await loadCurrentUser()
    }

    const needsUser = missingProfile.value || !isRegistered.value
    const needsRoleProfile = needsProfileCompletion.value
    const isCompleteProfileRoute = to.name === 'auth-complete-profile'

    if (
      (needsUser || needsRoleProfile) &&
      !isCompleteProfileRoute &&
      to.meta.requiresProfile !== false
    ) {
      return {
        name: 'auth-complete-profile',
        query: { redirect: to.fullPath },
      }
    }

    if (!needsUser && !needsRoleProfile && isCompleteProfileRoute) {
      return { path: getRouteForRole(role.value) }
    }

    if (
      to.meta.preventLoggedIn &&
      isRegistered.value &&
      !needsRoleProfile &&
      to.name !== 'auth-complete-profile'
    ) {
      return { path: getRouteForRole(role.value) }
    }

    if (to.meta.role && role.value && to.meta.role !== role.value) {
      return { name: 'forbidden' }
    }
  }

  return true
})

export default router
