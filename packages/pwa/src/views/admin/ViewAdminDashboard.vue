<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'

import { UserRole } from '@vaccin-delivery/types'

import { HEALTH_QUERY, type HealthQuery } from '@/assets/graphql/health.query'
import { ADMIN_AREA_QUERY } from '@/assets/graphql/role-proof.query'
import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'

const { currentUser, loading: userLoading } = useCurrentUser()

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
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Admin dashboard</h2>
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
        <UButton to="/profile" size="sm" variant="ghost">
          Naar profiel
        </UButton>
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
        <h3 class="font-semibold">Rol-proof (Phase 5)</h3>
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
