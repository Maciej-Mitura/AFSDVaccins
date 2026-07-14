<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Admin dashboard</h2>
      </template>
      <p class="text-sm text-muted">
        Placeholder voor beheer van orders, stock en routes.
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">API status</h3>
      </template>

      <CommonLoadingSkeleton v-if="loading" />

      <CommonErrorState
        v-else-if="error"
        title="API niet bereikbaar"
        :description="errorMessage"
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@vue/apollo-composable'

import { HEALTH_QUERY } from '@/assets/graphql/health.query'
import type { HealthQueryResult } from '@/assets/graphql/health.types'
import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'

const { result, loading, error } = useQuery<HealthQueryResult>(HEALTH_QUERY)

const health = computed(() => result.value?.health)

const errorMessage = computed(() => {
  if (error.value?.networkError) {
    return 'Controleer of de API draait op poort 3000.'
  }
  return error.value?.message ?? 'Onbekende fout bij het ophalen van de API-status.'
})
</script>
