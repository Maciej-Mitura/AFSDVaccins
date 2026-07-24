<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useI18n } from 'vue-i18n'

import { UserRole } from '@vaccin-delivery/types'

import { BEZORGER_AREA_QUERY } from '@/assets/graphql/role-proof.query'
import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { userRoleLabel } from '@/i18n'

const { t } = useI18n()
const { currentUser, loading: userLoading } = useCurrentUser()

const { result, loading, error } = useQuery(BEZORGER_AREA_QUERY, null, () => ({
  enabled: currentUser.value?.role === UserRole.Bezorger,
}))

const roleProof = computed(() => result.value?.bezorgerArea)
const errorMessage = computed(
  () => error.value?.message ?? t('bezorger.dashboard.roleProof.fetchFailed'),
)
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">
          {{ t('bezorger.dashboard.title') }}
        </h2>
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
        <UButton to="/profile" size="sm" variant="ghost">
          {{ t('bezorger.dashboard.goToProfile') }}
        </UButton>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">
          {{ t('bezorger.dashboard.roleProof.title') }}
        </h3>
      </template>

      <CommonLoadingSkeleton v-if="loading" />
      <CommonErrorState
        v-else-if="error"
        :title="t('bezorger.dashboard.roleProof.failed')"
        :description="errorMessage"
      />
      <p v-else-if="roleProof" class="text-sm">{{ roleProof }}</p>
      <CommonEmptyState
        v-else
        :title="t('bezorger.dashboard.roleProof.empty.title')"
        :description="t('bezorger.dashboard.roleProof.empty.description')"
      />
    </UCard>
  </div>
</template>
