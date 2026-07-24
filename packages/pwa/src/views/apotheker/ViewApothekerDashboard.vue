<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { useI18n } from 'vue-i18n'

import { UserRole } from '@vaccin-delivery/types'

import { APOTHEKER_AREA_QUERY } from '@/assets/graphql/role-proof.query'
import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { userRoleLabel } from '@/i18n'

const { t } = useI18n()
const { currentUser, loading: userLoading } = useCurrentUser()

const { result, loading, error } = useQuery(APOTHEKER_AREA_QUERY, null, () => ({
  enabled: currentUser.value?.role === UserRole.Apotheker,
}))

const roleProof = computed(() => result.value?.apothekerArea)
const errorMessage = computed(
  () => error.value?.message ?? t('admin.dashboard.roleProof.fetchFailed'),
)
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">
          {{ t('apotheker.dashboard.title') }}
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
          {{ t('common.go.profile') }}
        </UButton>
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
      <p v-else-if="roleProof" class="text-sm">{{ roleProof }}</p>
      <CommonEmptyState
        v-else
        :title="t('admin.dashboard.roleProof.empty.title')"
        :description="t('apotheker.dashboard.roleProof.empty.description')"
      />
    </UCard>
  </div>
</template>
