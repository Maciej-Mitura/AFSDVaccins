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
void loadAdminWeeklyStatistics(
  new Date().getFullYear(),
  getIsoWeek(new Date()),
)

const { result: healthResult, loading: healthLoading } =
  useQuery<HealthQuery>(HEALTH_QUERY)

const { result, loading, error } = useQuery(ADMIN_AREA_QUERY, null, () => ({
  enabled: currentUser.value?.role === UserRole.Admin,
}))

const health = computed(() => healthResult.value?.health)
const roleProof = computed(() => result.value?.adminArea)
const errorMessage = computed(
  () => error.value?.message ?? 'Kon autorisatieproof niet ophalen.',
)

function getIsoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
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
        <h2 class="text-lg font-semibold">Vandaag — leveroverzicht</h2>
      </template>
      <CommonLoadingSkeleton v-if="adminOverviewLoading && !dailyOverview" />
      <div v-else class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p>
          <span class="font-medium">Bestellingen:</span>
          {{ dailyOverview.totalOrders }}
        </p>
        <p>
          <span class="font-medium">Dosissen:</span>
          {{ dailyOverview.totalDoses }}
        </p>
        <p>
          <span class="font-medium">Geannuleerd:</span>
          {{ dailyOverview.cancelledOrderCount }}
        </p>
        <p>
          <span class="font-medium">Status:</span>
          {{
            dailyOverview.statusCounts
              .filter(item => item.count > 0)
              .map(item => `${item.status}: ${item.count}`)
              .join(', ')
          }}
        </p>
      </div>
    </UCard>

    <UCard v-if="weeklyStatistics">
      <template #header>
        <h3 class="font-semibold">
          Week {{ weeklyStatistics.isoWeek }} / {{ weeklyStatistics.isoYear }}
        </h3>
      </template>
      <div class="space-y-2 text-sm">
        <p>
          <span class="font-medium">Actieve bestellingen:</span>
          {{ weeklyStatistics.totalOrders }} ({{
            weeklyStatistics.totalDoses
          }}
          dosissen)
        </p>
        <div v-if="weeklyStatistics.vaccineQuantities.length">
          <p class="font-medium">Per vaccin:</p>
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
          <h3 class="font-semibold">Operaties feed</h3>
          <UButton to="/admin/orders" size="sm" variant="ghost">
            Naar bestellingen
          </UButton>
        </div>
      </template>
      <CommonEmptyState
        v-if="feedEvents.length === 0"
        title="Nog geen live events"
        description="Nieuwe bestellingen en statuswijzigingen verschijnen hier."
      />
      <ul v-else class="space-y-2 text-sm">
        <li v-for="(event, index) in feedEvents.slice(0, 10)" :key="index">
          <span class="font-medium">{{ event.eventType }}</span>
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
          <span class="font-medium">Naam:</span>
          {{ currentUser.firstName }} {{ currentUser.lastName }}
        </p>
        <p>
          <span class="font-medium">E-mail:</span>
          {{ currentUser.email }}
        </p>
        <p>
          <span class="font-medium">Rol:</span>
          {{ currentUser.role }}
        </p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">API status</h3>
      </template>
      <CommonLoadingSkeleton v-if="healthLoading" />
      <div v-else-if="health" class="space-y-2 text-sm">
        <p>
          <span class="font-medium">Status:</span>
          {{ health.status }}
        </p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">Rol-proof</h3>
      </template>

      <CommonLoadingSkeleton v-if="loading" />
      <CommonErrorState
        v-else-if="error"
        title="Autorisatieproof mislukt"
        :description="errorMessage"
      />
      <p v-else-if="roleProof" class="text-sm">{{ roleProof }}</p>
      <CommonEmptyState
        v-else
        title="Geen proof"
        description="De admin proof query gaf geen resultaat terug."
      />
    </UCard>
  </div>
</template>
