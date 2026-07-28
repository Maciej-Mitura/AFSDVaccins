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
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
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
import { resolveOperationsFeedDetail } from '@/utils/operations-feed-display'

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

const lowStockEvents = computed(() =>
  feedEvents.value
    .filter(event => String(event.eventType) === 'LOW_STOCK')
    .slice(0, 5),
)

const activityEvents = computed(() =>
  feedEvents.value
    .filter(event => String(event.eventType) !== 'LOW_STOCK')
    .slice(0, 10),
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
  <div class="space-y-8" data-testid="admin-dashboard">
    <CommonPageHeader :title="t('admin.dashboard.title')">
      <template #actions>
        <UButton to="/admin/orders" size="sm" color="primary" variant="soft">
          {{ t('admin.dashboard.goToOrders') }}
        </UButton>
      </template>
    </CommonPageHeader>

    <CommonRealtimeStatus />

    <CommonPageSection
      v-if="dailyOverview || adminOverviewLoading"
      :title="t('admin.dashboard.dailyOverview')"
    >
      <div data-testid="admin-dashboard-daily">
        <CommonLoadingSkeleton v-if="adminOverviewLoading && !dailyOverview" />
        <div
          v-else-if="dailyOverview"
          class="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="admin-dashboard-metrics"
        >
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-toned">
              {{ t('admin.dashboard.orders') }}
            </p>
            <p
              class="mt-1 text-2xl font-semibold tabular-nums text-highlighted"
            >
              {{ dailyOverview.totalOrders }}
            </p>
          </div>
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-toned">
              {{ t('admin.dashboard.doses') }}
            </p>
            <p
              class="mt-1 text-2xl font-semibold tabular-nums text-highlighted"
            >
              {{ dailyOverview.totalDoses }}
            </p>
          </div>
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-toned">
              {{ t('admin.dashboard.cancelled') }}
            </p>
            <p
              class="mt-1 text-2xl font-semibold tabular-nums text-highlighted"
            >
              {{ dailyOverview.cancelledOrderCount }}
            </p>
          </div>
          <div class="min-w-0 sm:col-span-2 lg:col-span-1">
            <p class="text-xs font-medium uppercase tracking-wide text-toned">
              {{ t('admin.dashboard.status') }}
            </p>
            <p class="mt-1 text-sm text-highlighted">
              {{
                formatStatusCounts(dailyOverview.statusCounts) ||
                t('common.emDash')
              }}
            </p>
          </div>
        </div>
      </div>
    </CommonPageSection>

    <CommonPageSection
      v-if="lowStockEvents.length > 0"
      :title="t('admin.stock.lowStock')"
    >
      <ul
        class="divide-y divide-default"
        role="list"
        data-testid="admin-dashboard-stock-warnings"
      >
        <li
          v-for="(event, index) in lowStockEvents"
          :key="`low-stock-${index}`"
          class="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5 text-sm"
        >
          <UBadge color="warning" variant="subtle">
            {{ operationsFeedEventTypeLabel(event.eventType) }}
          </UBadge>
          <span>{{ resolveOperationsFeedDetail(event, t) }}</span>
        </li>
      </ul>
    </CommonPageSection>

    <CommonPageSection :title="t('admin.dashboard.operationsFeed')">
      <template #actions>
        <UButton to="/admin/orders" size="sm" variant="ghost">
          {{ t('admin.dashboard.goToOrders') }}
        </UButton>
      </template>

      <div data-testid="admin-dashboard-operations">
        <CommonEmptyState
          v-if="activityEvents.length === 0"
          :title="t('admin.dashboard.operationsFeed.empty.title')"
          :description="t('admin.dashboard.operationsFeed.empty.description')"
        />
        <ul v-else class="divide-y divide-default" role="list">
          <li
            v-for="(event, index) in activityEvents"
            :key="`feed-${index}`"
            class="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5 text-sm"
          >
            <span class="font-medium text-highlighted">{{
              operationsFeedEventTypeLabel(event.eventType)
            }}</span>
            <span class="text-toned">{{
              resolveOperationsFeedDetail(event, t)
            }}</span>
          </li>
        </ul>
      </div>
    </CommonPageSection>

    <CommonPageSection
      v-if="weeklyStatistics"
      :title="
        t('admin.dashboard.weekTitle', {
          week: weeklyStatistics.isoWeek,
          year: weeklyStatistics.isoYear,
        })
      "
      variant="inset"
    >
      <div class="space-y-2 text-sm" data-testid="admin-dashboard-weekly">
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
          <ul class="mt-1 list-inside list-disc text-toned">
            <li
              v-for="item in weeklyStatistics.vaccineQuantities"
              :key="item.vaccineId"
            >
              {{ item.vaccineName }}: {{ item.quantity }}
            </li>
          </ul>
        </div>
      </div>
    </CommonPageSection>

    <CommonPageSection variant="inset">
      <details class="group" data-testid="admin-dashboard-diagnostics">
        <summary
          class="cursor-pointer list-none text-sm font-medium text-toned outline-none marker:content-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span class="inline-flex items-center gap-2">
            <UIcon
              name="i-lucide-chevron-right"
              class="size-4 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
            {{ t('admin.dashboard.roleProof.title') }}
            ·
            {{ t('admin.dashboard.apiStatus') }}
          </span>
        </summary>

        <div class="mt-4 space-y-6">
          <div data-testid="admin-dashboard-identity">
            <h3 class="text-sm font-semibold text-highlighted">
              {{ t('admin.dashboard.title') }}
            </h3>
            <CommonLoadingSkeleton v-if="userLoading" />
            <div v-else-if="currentUser" class="mt-2 space-y-1 text-sm">
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
          </div>

          <div data-testid="admin-dashboard-api-health">
            <h3 class="text-sm font-semibold text-highlighted">
              {{ t('admin.dashboard.apiStatus') }}
            </h3>
            <CommonLoadingSkeleton v-if="healthLoading" />
            <div v-else-if="health" class="mt-2 space-y-1 text-sm">
              <p>
                <span class="font-medium"
                  >{{ t('admin.dashboard.status') }}:</span
                >
                {{ apiHealthStatusLabel(health.status) }}
              </p>
            </div>
          </div>

          <div data-testid="admin-dashboard-role-proof">
            <h3 class="text-sm font-semibold text-highlighted">
              {{ t('admin.dashboard.roleProof.title') }}
            </h3>
            <CommonLoadingSkeleton v-if="loading" />
            <CommonErrorState
              v-else-if="error"
              :title="t('admin.dashboard.roleProof.failed')"
              :description="errorMessage"
            />
            <p v-else-if="roleProof" class="mt-2 text-sm">
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
          </div>
        </div>
      </details>
    </CommonPageSection>
  </div>
</template>
