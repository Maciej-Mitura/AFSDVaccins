<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useI18n } from 'vue-i18n'

import { UserRole } from '@vaccin-delivery/types'

import { HEALTH_QUERY, type HealthQuery } from '@/assets/graphql/health.query'
import { ADMIN_AREA_QUERY } from '@/assets/graphql/role-proof.query'
import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonRealtimeStatus from '@/components/common/CommonRealtimeStatus.vue'
import { registerReconnectHandler } from '@/composables/useGraphQL'
import { useAdminOperationsFeed } from '@/composables/useAdminOperationsFeed'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useOrders } from '@/composables/useOrders'
import {
  apiHealthStatusLabel,
  operationsFeedEventTypeLabel,
  orderStatusLabel,
  userRoleLabel,
} from '@/i18n'

const { t } = useI18n()
const { currentUser, loading: userLoading } = useCurrentUser()

const {
  dailyOverview,
  weeklyStatistics,
  adminOverviewLoading,
  loadAdminDailyOverview,
  loadAdminWeeklyStatistics,
} = useOrders()

const { feedEvents, subscribeToAdminOperationsFeed, stopFeedSubscription } =
  useAdminOperationsFeed()

const today = new Date().toISOString().slice(0, 10)
let reconnectCleanup: (() => void) | null = null

void loadAdminDailyOverview(today)
void loadAdminWeeklyStatistics(new Date().getFullYear(), getIsoWeek(new Date()))

const { result: healthResult, loading: healthLoading } =
  useQuery<HealthQuery>(HEALTH_QUERY)

const { result, loading, error } = useQuery(ADMIN_AREA_QUERY, null, () => ({
  enabled: currentUser.value?.role === UserRole.Admin,
}))

const health = computed(() => healthResult.value?.health)
const roleProof = computed(() => result.value?.adminArea)
const errorMessage = computed(
  () => error.value?.message ?? t('admin.dashboard.roleProof.fetchFailed'),
)

function getIsoWeek(date: Date): number {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  )
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  )
}

function formatStatusCounts(
  counts: Array<{ status: string; count: number }>,
): string {
  return counts
    .filter(item => item.count > 0)
    .map(item => `${orderStatusLabel(item.status)}: ${item.count}`)
    .join(', ')
}

onMounted(() => {
  subscribeToAdminOperationsFeed()
  reconnectCleanup = registerReconnectHandler(async () => {
    await loadAdminDailyOverview(today)
    await loadAdminWeeklyStatistics(
      new Date().getFullYear(),
      getIsoWeek(new Date()),
    )
  })
})

onUnmounted(() => {
  stopFeedSubscription()
  reconnectCleanup?.()
})
</script>

<template>
  <div class="space-y-6">
    <CommonRealtimeStatus />

    <UCard v-if="dailyOverview">
      <template #header>
        <h2 class="text-lg font-semibold">
          {{ t('admin.dashboard.dailyOverview') }}
        </h2>
      </template>
      <CommonLoadingSkeleton v-if="adminOverviewLoading && !dailyOverview" />
      <div v-else class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p>
          <span class="font-medium">{{ t('admin.dashboard.orders') }}:</span>
          {{ dailyOverview.totalOrders }}
        </p>
        <p>
          <span class="font-medium">{{ t('admin.dashboard.doses') }}:</span>
          {{ dailyOverview.totalDoses }}
        </p>
        <p>
          <span class="font-medium">{{ t('admin.dashboard.cancelled') }}:</span>
          {{ dailyOverview.cancelledOrderCount }}
        </p>
        <p>
          <span class="font-medium">{{ t('admin.dashboard.status') }}:</span>
          {{ formatStatusCounts(dailyOverview.statusCounts) }}
        </p>
      </div>
    </UCard>

    <UCard v-if="weeklyStatistics">
      <template #header>
        <h3 class="font-semibold">
          {{
            t('admin.dashboard.weekTitle', {
              week: weeklyStatistics.isoWeek,
              year: weeklyStatistics.isoYear,
            })
          }}
        </h3>
      </template>
      <div class="space-y-2 text-sm">
        <p>
          <span class="font-medium"
            >{{ t('admin.dashboard.activeOrders') }}:</span
          >
          {{
            t('admin.dashboard.weeklyOrdersSummary', {
              count: weeklyStatistics.totalOrders,
              doses: weeklyStatistics.totalDoses,
            })
          }}
        </p>
        <div v-if="weeklyStatistics.vaccineQuantities.length">
          <p class="font-medium">{{ t('admin.dashboard.perVaccine') }}:</p>
          <ul class="list-inside list-disc">
            <li
              v-for="item in weeklyStatistics.vaccineQuantities"
              :key="item.vaccineId"
            >
              {{ item.vaccineName }}: {{ item.quantity }}
            </li>
          </ul>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-semibold">
            {{ t('admin.dashboard.operationsFeed') }}
          </h3>
          <UButton to="/admin/orders" size="sm" variant="ghost">
            {{ t('admin.dashboard.goToOrders') }}
          </UButton>
        </div>
      </template>
      <CommonEmptyState
        v-if="feedEvents.length === 0"
        :title="t('admin.dashboard.operationsFeed.empty.title')"
        :description="t('admin.dashboard.operationsFeed.empty.description')"
      />
      <ul v-else class="space-y-2 text-sm">
        <li v-for="(event, index) in feedEvents.slice(0, 10)" :key="index">
          <span class="font-medium">{{
            operationsFeedEventTypeLabel(event.eventType)
          }}</span>
          — {{ event.message }}
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('admin.dashboard.title') }}</h2>
      </template>

      <CommonLoadingSkeleton v-if="userLoading" />

      <div v-else-if="currentUser" class="space-y-2 text-sm">
        <p>
          <span class="font-medium">{{ t('common.name') }}:</span>
          {{ currentUser.firstName }} {{ currentUser.lastName }}
        </p>
        <p>
          <span class="font-medium">{{ t('common.email') }}:</span>
          {{ currentUser.email }}
        </p>
        <p>
          <span class="font-medium">{{ t('common.role') }}:</span>
          {{ userRoleLabel(currentUser.role) }}
        </p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">{{ t('admin.dashboard.apiStatus') }}</h3>
      </template>
      <CommonLoadingSkeleton v-if="healthLoading" />
      <div v-else-if="health" class="space-y-2 text-sm">
        <p>
          <span class="font-medium">{{ t('admin.dashboard.status') }}:</span>
          {{ apiHealthStatusLabel(health.status) }}
        </p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">
          {{ t('admin.dashboard.roleProof.title') }}
        </h3>
      </template>

      <CommonLoadingSkeleton v-if="loading" />
      <CommonErrorState
        v-else-if="error"
        :title="t('admin.dashboard.roleProof.failed')"
        :description="errorMessage"
      />
      <p v-else-if="roleProof" class="text-sm">
        {{
          t('admin.dashboard.roleProof.accessible', {
            name: currentUser
              ? `${currentUser.firstName} ${currentUser.lastName}`.trim()
              : '',
          })
        }}
      </p>
      <CommonEmptyState
        v-else
        :title="t('admin.dashboard.roleProof.empty.title')"
        :description="t('admin.dashboard.roleProof.empty.description')"
      />
    </UCard>
  </div>
</template>
