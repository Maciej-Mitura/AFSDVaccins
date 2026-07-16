<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useDeliveryRoutes } from '@/composables/useDeliveryRoutes'
import { useRouteTemplates } from '@/composables/useRouteTemplates'

function todayLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const {
  deliveryRoutes,
  activeTemplates,
  loading,
  templatesLoading,
  generating,
  errorMessage,
  generateError,
  successMessage,
  loadActiveTemplates,
  loadDeliveryRoutes,
  generateDeliveryRoute,
  formatAddress,
} = useDeliveryRoutes()

const { bezorgerProfiles, loadProfileOptions, findBezorgerProfile } =
  useRouteTemplates()

const deliveryDate = ref(todayLocalDate())
const selectedTemplateId = ref<string | undefined>(undefined)
const confirmRegenerate = ref(false)

const selectedTemplate = computed(() =>
  activeTemplates.value.find(
    template => template.id === selectedTemplateId.value,
  ),
)

const selectedCourier = computed(() => {
  const template = selectedTemplate.value

  if (!template) {
    return null
  }

  return findBezorgerProfile(template.bezorgerProfileId) ?? null
})

const existingRouteForSelection = computed(() => {
  const template = selectedTemplate.value

  if (!template) {
    return null
  }

  return (
    deliveryRoutes.value.find(
      route =>
        route.deliveryDate === deliveryDate.value &&
        route.bezorgerProfileId === template.bezorgerProfileId,
    ) ?? null
  )
})

const templateOptions = computed(() =>
  activeTemplates.value.map(template => {
    const courier = findBezorgerProfile(template.bezorgerProfileId)
    const courierLabel = courier?.displayName ?? template.bezorgerProfileId
    return {
      label: `${template.name} — ${courierLabel}`,
      value: template.id,
    }
  }),
)

const routesForDate = computed(() =>
  deliveryRoutes.value.filter(
    route => route.deliveryDate === deliveryDate.value,
  ),
)

async function refresh(): Promise<void> {
  await Promise.all([
    loadActiveTemplates(),
    loadProfileOptions(),
    loadDeliveryRoutes({ deliveryDate: deliveryDate.value }),
  ])
}

async function onGenerate(): Promise<void> {
  if (!selectedTemplateId.value) {
    return
  }

  if (existingRouteForSelection.value && !confirmRegenerate.value) {
    confirmRegenerate.value = true
    return
  }

  confirmRegenerate.value = false
  await generateDeliveryRoute(selectedTemplateId.value, deliveryDate.value)
  await loadDeliveryRoutes({ deliveryDate: deliveryDate.value })
}

function cancelRegenerateConfirm(): void {
  confirmRegenerate.value = false
}

watch(deliveryDate, () => {
  confirmRegenerate.value = false
  void loadDeliveryRoutes({ deliveryDate: deliveryDate.value })
})

watch(selectedTemplateId, () => {
  confirmRegenerate.value = false
})

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Routeplanning</h1>
      <p class="mt-1 text-sm text-muted">
        Genereer dagelijkse bezorgroutes vanuit actieve routetemplates.
      </p>
    </div>

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Route genereren</h2>
      </template>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Leveringsdatum">
          <UInput v-model="deliveryDate" type="date" />
        </UFormField>

        <UFormField label="Actieve template">
          <USelect
            v-model="selectedTemplateId"
            :items="templateOptions"
            placeholder="Kies een template"
            :loading="templatesLoading"
          />
        </UFormField>
      </div>

      <div
        v-if="selectedCourier"
        class="mt-4 rounded-md bg-elevated/50 px-3 py-2 text-sm"
      >
        <span class="font-medium">Bezorger:</span>
        {{ selectedCourier.displayName }}
        <span v-if="selectedCourier.vehicleLabel" class="text-muted">
          ({{ selectedCourier.vehicleLabel }})
        </span>
      </div>

      <UAlert
        v-if="existingRouteForSelection && confirmRegenerate"
        class="mt-4"
        color="warning"
        variant="subtle"
        title="Bestaande route bijwerken?"
        description="Er bestaat al een route voor deze bezorger en datum. Regenereren werkt de bestaande route bij (geen duplicaat)."
      />

      <div class="mt-4 flex flex-wrap gap-2">
        <UButton
          :loading="generating"
          :disabled="!selectedTemplateId || generating"
          @click="onGenerate"
        >
          {{
            existingRouteForSelection
              ? confirmRegenerate
                ? 'Bevestig regenereren'
                : 'Opnieuw genereren'
              : 'Genereer route'
          }}
        </UButton>
        <UButton
          v-if="confirmRegenerate"
          variant="ghost"
          @click="cancelRegenerateConfirm"
        >
          Annuleren
        </UButton>
      </div>

      <UAlert
        v-if="successMessage"
        class="mt-4"
        color="success"
        variant="subtle"
        :title="successMessage"
      />
      <CommonErrorState
        v-if="generateError"
        class="mt-4"
        title="Genereren mislukt"
        :description="generateError"
      />
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">
          Gegenereerde routes — {{ deliveryDate }}
        </h2>
      </template>

      <CommonLoadingSkeleton v-if="loading" />
      <CommonErrorState
        v-else-if="errorMessage"
        title="Kon routes niet laden"
        :description="errorMessage"
      />
      <CommonEmptyState
        v-else-if="routesForDate.length === 0"
        title="Geen routes voor deze datum"
        description="Genereer een route vanuit een actieve template."
      />

      <div v-else class="space-y-6">
        <div
          v-for="route in routesForDate"
          :key="route.id"
          class="space-y-3 border-b border-default pb-6 last:border-0 last:pb-0"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p class="font-medium">
                {{
                  findBezorgerProfile(route.bezorgerProfileId)?.displayName ??
                  route.bezorgerProfileId
                }}
              </p>
              <p class="text-sm text-muted">
                Status: {{ route.status }} · Gegenereerd
                {{ new Date(route.generatedAt).toLocaleString('nl-BE') }}
              </p>
            </div>
            <UBadge
              v-if="route.skippedApothekerProfileIds.length > 0"
              color="neutral"
              variant="subtle"
            >
              {{ route.skippedApothekerProfileIds.length }} overgeslagen
              apotheek(en)
            </UBadge>
          </div>

          <CommonEmptyState
            v-if="route.stops.length === 0"
            title="Lege route"
            description="Geen kwalificerende bestellingen voor de template-stops. Overgeslagen apotheken staan in de auditlijst."
          />

          <ul v-else class="space-y-3">
            <li
              v-for="stop in route.stops"
              :key="`${route.id}-${stop.sequence}`"
              class="rounded-md bg-elevated/40 px-3 py-3"
            >
              <p class="font-medium">
                {{ stop.sequence }}. {{ stop.pharmacyName }}
              </p>
              <p class="text-sm text-muted">{{ formatAddress(stop) }}</p>
              <p class="mt-1 text-sm">
                {{ stop.orderCount }} bestelling(en) ·
                {{ stop.totalQuantity }} dosissen
              </p>
              <ul class="mt-1 text-sm text-muted">
                <li v-for="line in stop.lines" :key="line.vaccineId">
                  {{ line.vaccineName }}: {{ line.quantity }}
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </UCard>
  </div>
</template>
