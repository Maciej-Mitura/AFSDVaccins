<script setup lang="ts">
import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useVaccines } from '@/composables/useVaccines'

const { activeVaccines, loading, errorMessage, loadVaccines } = useVaccines()

void loadVaccines(false)
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Vaccincatalogus</h2>
      </template>

      <p class="mb-4 text-sm text-muted">
        Overzicht van beschikbare vaccins voor bestellingen.
      </p>

      <CommonLoadingSkeleton v-if="loading && activeVaccines.length === 0" />

      <CommonErrorState
        v-else-if="errorMessage"
        title="Catalogus laden mislukt"
        :description="errorMessage"
      />

      <CommonEmptyState
        v-else-if="activeVaccines.length === 0"
        title="Geen actieve vaccins"
        description="Er zijn momenteel geen vaccins beschikbaar in de catalogus."
      />

      <div v-else class="space-y-4">
        <UCard v-for="vaccine in activeVaccines" :key="vaccine.id">
          <div class="space-y-2 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">{{ vaccine.name }}</h3>
              <UBadge color="success" variant="subtle">Beschikbaar</UBadge>
            </div>
            <p>{{ vaccine.description || 'Geen beschrijving' }}</p>
            <p>
              <span class="font-medium">Fabrikant:</span>
              {{ vaccine.manufacturer }}
            </p>
          </div>
        </UCard>
      </div>
    </UCard>
  </div>
</template>
