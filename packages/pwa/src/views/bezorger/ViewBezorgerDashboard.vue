<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'

import { UserRole } from '@vaccin-delivery/types'

import { BEZORGER_AREA_QUERY } from '@/assets/graphql/role-proof.query'
import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'

const { currentUser, loading: userLoading } = useCurrentUser()

const { result, loading, error } = useQuery(BEZORGER_AREA_QUERY, null, () => ({
  enabled: currentUser.value?.role === UserRole.Bezorger,
}))

const roleProof = computed(() => result.value?.bezorgerArea)
const errorMessage = computed(
  () => error.value?.message ?? 'Kon autorisatieproof niet ophalen.',
)
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Bezorger dashboard</h2>
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
        description="De bezorger proof query gaf geen resultaat terug."
      />
    </UCard>
  </div>
</template>
