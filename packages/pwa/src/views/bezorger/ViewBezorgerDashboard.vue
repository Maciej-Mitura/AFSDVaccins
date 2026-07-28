<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useI18n } from 'vue-i18n'

import { RouteStatus, UserRole } from '@vaccin-delivery/types'

import { BEZORGER_AREA_QUERY } from '@/assets/graphql/role-proof.query'
import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import { registerReconnectHandler } from '@/composables/useGraphQL'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useDeliveryRoutes } from '@/composables/useDeliveryRoutes'
import { useNotifications } from '@/composables/useNotifications'
import { routeStatusLabel } from '@/i18n'

const { t } = useI18n()
const { currentUser, loading: userLoading } = useCurrentUser()

const {
  myTodayRoute,
  loading: routeLoading,
  loadMyTodayRoute,
  myTomorrowRoutePreview,
  previewLoading,
  loadMyTomorrowRoutePreview,
} = useDeliveryRoutes()

const { unreadCount, loadUnreadCount } = useNotifications()

const {
  result,
  loading: proofLoading,
  error,
} = useQuery(BEZORGER_AREA_QUERY, null, () => ({
  enabled: currentUser.value?.role === UserRole.Bezorger,
}))

const roleProof = computed(() => result.value?.bezorgerArea)
const errorMessage = computed(
  () => error.value?.message ?? t('bezorger.dashboard.roleProof.fetchFailed'),
)

const welcomeMeta = computed(() => {
  if (!currentUser.value) {
    return undefined
  }
  return `${currentUser.value.firstName} ${currentUser.value.lastName}`
})

const todayStatusColor = computed(() => {
  const status = myTodayRoute.value?.status
  if (status === RouteStatus.InProgress) {
    return 'primary'
  }
  if (status === RouteStatus.Completed) {
    return 'success'
  }
  if (status === RouteStatus.Cancelled) {
    return 'error'
  }
  if (status === RouteStatus.Assigned) {
    return 'warning'
  }
  return 'neutral'
})

const todaySummaryText = computed(() => {
  if (!myTodayRoute.value) {
    return t('bezorger.dashboard.todayRoute.none')
  }
  const status = myTodayRoute.value.status
  if (status === RouteStatus.Assigned) {
    return t('bezorger.dashboard.todayRoute.assigned')
  }
  if (status === RouteStatus.InProgress) {
    return t('bezorger.dashboard.todayRoute.inProgress')
  }
  if (status === RouteStatus.Completed) {
    return t('bezorger.dashboard.todayRoute.completed')
  }
  if (status === RouteStatus.Cancelled) {
    return t('bezorger.dashboard.todayRoute.cancelled')
  }
  return routeStatusLabel(status)
})

const primaryAction = computed(() => {
  const route = myTodayRoute.value
  if (!route) {
    return {
      to: '/bezorger/today',
      label: t('bezorger.dashboard.goToToday'),
      testId: 'dashboard-go-today',
      color: 'primary' as const,
      variant: 'soft' as const,
    }
  }
  if (route.status === RouteStatus.Assigned) {
    return {
      to: '/bezorger/today',
      label: t('bezorger.dashboard.startRoute'),
      testId: 'dashboard-start-route',
      color: 'primary' as const,
      variant: 'solid' as const,
    }
  }
  if (route.status === RouteStatus.InProgress) {
    return {
      to: '/bezorger/today',
      label: t('bezorger.dashboard.resumeRoute'),
      testId: 'dashboard-resume-route',
      color: 'primary' as const,
      variant: 'solid' as const,
    }
  }
  return {
    to: '/bezorger/today',
    label: t('bezorger.dashboard.goToToday'),
    testId: 'dashboard-go-today',
    color: 'primary' as const,
    variant: 'soft' as const,
  }
})

const tomorrowSummary = computed(() => {
  const preview = myTomorrowRoutePreview.value
  if (!preview) {
    return t('bezorger.dashboard.nextRoute.none')
  }
  return t('bezorger.dashboard.nextRoute.summary', {
    date: preview.deliveryDate,
    stops: preview.totalStops,
  })
})

let reconnectCleanup: (() => void) | null = null

async function refreshDashboard(): Promise<void> {
  await Promise.all([
    loadMyTodayRoute({ isRefresh: Boolean(myTodayRoute.value) }),
    loadMyTomorrowRoutePreview(),
    loadUnreadCount(),
  ])
}

onMounted(() => {
  void refreshDashboard()
  reconnectCleanup = registerReconnectHandler(() => refreshDashboard())
})

onUnmounted(() => {
  reconnectCleanup?.()
})
</script>

<template>
  <div class="mx-auto max-w-xl space-y-8" data-testid="bezorger-dashboard">
    <CommonPageHeader
      :title="t('bezorger.dashboard.title')"
      :subtitle="t('bezorger.dashboard.subtitle')"
      :meta="welcomeMeta"
    >
      <template #actions>
        <UButton
          :to="primaryAction.to"
          size="sm"
          :color="primaryAction.color"
          :variant="primaryAction.variant"
          :data-testid="primaryAction.testId"
        >
          {{ primaryAction.label }}
        </UButton>
      </template>
    </CommonPageHeader>

    <div data-testid="dashboard-today-section">
      <CommonPageSection :title="t('bezorger.dashboard.todayRoute.title')">
        <CommonLoadingSkeleton
          v-if="userLoading || (routeLoading && !myTodayRoute)"
        />
        <div v-else class="space-y-4">
          <div
            class="flex flex-wrap items-start justify-between gap-3"
            data-testid="dashboard-today-summary"
          >
            <div class="min-w-0 space-y-1">
              <p class="text-sm text-toned">
                {{ todaySummaryText }}
              </p>
              <p
                v-if="myTodayRoute"
                class="text-sm text-muted"
                data-testid="dashboard-today-date"
              >
                {{
                  t('bezorger.route.date', { date: myTodayRoute.deliveryDate })
                }}
              </p>
            </div>
            <UBadge
              v-if="myTodayRoute"
              variant="subtle"
              :color="todayStatusColor"
              data-testid="dashboard-today-status"
            >
              {{ routeStatusLabel(myTodayRoute.status) }}
            </UBadge>
            <UBadge
              v-else
              variant="subtle"
              color="neutral"
              data-testid="dashboard-today-status"
            >
              {{ t('bezorger.dashboard.todayRoute.unassigned') }}
            </UBadge>
          </div>

          <UButton
            :to="primaryAction.to"
            block
            size="xl"
            class="min-h-14 text-base"
            :color="primaryAction.color"
            :variant="primaryAction.variant"
            :data-testid="`${primaryAction.testId}-block`"
          >
            {{ primaryAction.label }}
          </UButton>
        </div>
      </CommonPageSection>
    </div>

    <div data-testid="dashboard-next-route-section">
      <CommonPageSection :title="t('bezorger.dashboard.nextRoute.title')">
        <CommonLoadingSkeleton
          v-if="previewLoading && !myTomorrowRoutePreview"
        />
        <div
          v-else
          class="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p class="text-toned" data-testid="dashboard-next-route-summary">
            {{ tomorrowSummary }}
          </p>
          <UButton
            to="/bezorger/tomorrow"
            size="sm"
            variant="ghost"
            color="neutral"
            data-testid="dashboard-go-tomorrow"
          >
            {{ t('bezorger.dashboard.goToTomorrow') }}
          </UButton>
        </div>
      </CommonPageSection>
    </div>

    <div data-testid="dashboard-notifications-section">
      <CommonPageSection
        variant="inset"
        :title="t('bezorger.dashboard.notifications.title')"
      >
        <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p
            v-if="unreadCount > 0"
            class="font-medium text-highlighted"
            data-testid="dashboard-unread-count"
          >
            {{
              t('bezorger.dashboard.notifications.unread', {
                count: unreadCount,
              })
            }}
          </p>
          <p v-else class="text-toned" data-testid="dashboard-unread-none">
            {{ t('bezorger.dashboard.notifications.none') }}
          </p>
          <UButton
            to="/bezorger/notifications"
            size="sm"
            variant="soft"
            color="primary"
            data-testid="dashboard-notifications-link"
          >
            {{ t('bezorger.dashboard.notifications.viewAll') }}
          </UButton>
        </div>
      </CommonPageSection>
    </div>

    <div data-testid="dashboard-secondary-links">
      <CommonPageSection>
        <ul class="divide-y divide-default" role="list">
          <li>
            <UButton
              to="/profile"
              block
              size="lg"
              class="min-h-11 justify-start"
              variant="ghost"
              color="neutral"
              data-testid="dashboard-go-profile"
            >
              {{ t('bezorger.dashboard.goToProfile') }}
            </UButton>
          </li>
        </ul>
      </CommonPageSection>
    </div>

    <details class="text-sm" data-testid="dashboard-role-proof-details">
      <summary class="cursor-pointer text-muted">
        {{ t('bezorger.dashboard.roleProof.title') }}
      </summary>
      <div class="mt-3 space-y-2">
        <CommonLoadingSkeleton v-if="proofLoading" />
        <CommonErrorState
          v-else-if="error"
          :title="t('bezorger.dashboard.roleProof.failed')"
          :description="errorMessage"
        />
        <p
          v-else-if="roleProof"
          class="text-sm text-toned"
          data-testid="dashboard-role-proof"
        >
          {{ roleProof }}
        </p>
        <CommonEmptyState
          v-else
          :title="t('bezorger.dashboard.roleProof.empty.title')"
          :description="t('bezorger.dashboard.roleProof.empty.description')"
        />
      </div>
    </details>
  </div>
</template>
