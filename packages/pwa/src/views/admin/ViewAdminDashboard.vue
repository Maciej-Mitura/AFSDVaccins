<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Admin dashboard</h2>
      </template>
      <p class="text-sm text-muted">
        Placeholder voor beheer van orders, stock en routes. Authenticatie is
        actief; rolgebaseerde autorisatie volgt in Phase 5.
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">API status</h3>
      </template>

      <CommonLoadingSkeleton v-if="healthLoading" />

      <CommonErrorState
        v-else-if="healthError"
        title="API niet bereikbaar"
        :description="healthErrorMessage"
      />

      <div v-else-if="health" class="space-y-2 text-sm">
        <p>
          <span class="font-medium">Status:</span>
          {{ health.status }}
        </p>
        <p>
          <span class="font-medium">Service:</span>
          {{ health.service }}
        </p>
        <p>
          <span class="font-medium">Omgeving:</span>
          {{ health.environment }}
        </p>
        <p>
          <span class="font-medium">Tijdstip:</span>
          {{ health.timestamp }}
        </p>
      </div>

      <CommonEmptyState
        v-else
        title="Geen status"
        description="De health query gaf geen resultaat terug."
      />
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">Firebase-identiteit (beschermde query)</h3>
      </template>

      <CommonLoadingSkeleton v-if="identityLoading" />

      <CommonErrorState
        v-else-if="identityError"
        title="Identiteit niet beschikbaar"
        :description="identityErrorMessage"
      />

      <div v-else-if="identity" class="space-y-2 text-sm">
        <p>
          <span class="font-medium">UID:</span>
          {{ identity.uid }}
        </p>
        <p>
          <span class="font-medium">E-mail:</span>
          {{ identity.email ?? '—' }}
        </p>
        <p>
          <span class="font-medium">Naam:</span>
          {{ identity.displayName ?? '—' }}
        </p>
        <p>
          <span class="font-medium">E-mail geverifieerd:</span>
          {{ identity.emailVerified ? 'ja' : 'nee' }}
        </p>
      </div>

      <CommonEmptyState
        v-else
        title="Niet ingelogd"
        description="Log in om currentFirebaseUser op te halen."
      />
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'

import {
  CURRENT_FIREBASE_USER_QUERY,
  type CurrentFirebaseUserQuery,
} from '@/assets/graphql/current-firebase-user.query'
import { HEALTH_QUERY, type HealthQuery } from '@/assets/graphql/health.query'
import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useFirebase } from '@/composables/useFirebase'

const { isAuthenticated } = useFirebase()

const {
  result: healthResult,
  loading: healthLoading,
  error: healthError,
} = useQuery<HealthQuery>(HEALTH_QUERY)

const {
  result: identityResult,
  loading: identityLoading,
  error: identityError,
} = useQuery<CurrentFirebaseUserQuery>(CURRENT_FIREBASE_USER_QUERY, null, {
  enabled: isAuthenticated,
})

const health = computed(() => healthResult.value?.health)
const identity = computed(() => identityResult.value?.currentFirebaseUser)

const healthErrorMessage = computed(() => {
  if (healthError.value?.networkError) {
    return 'Controleer of de API draait op poort 3000.'
  }

  return (
    healthError.value?.message ??
    'Onbekende fout bij het ophalen van de API-status.'
  )
})

const identityErrorMessage = computed(() => {
  if (identityError.value?.networkError) {
    return 'Controleer of je bent ingelogd en de API bereikbaar is.'
  }

  return (
    identityError.value?.message ?? 'Kon de Firebase-identiteit niet ophalen.'
  )
})
</script>
