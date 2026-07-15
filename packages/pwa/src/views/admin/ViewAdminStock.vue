<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import { StockAdjustmentType } from '@vaccin-delivery/types'
import * as z from 'zod'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import {
  useStock,
  type StockOverviewItem,
} from '@/composables/useStock'

const router = useRouter()

const {
  overview,
  loading,
  adjusting,
  errorMessage,
  successMessage,
  loadStockOverview,
  adjustStock,
  isInsufficientStockError,
  isInvalidStockAdjustmentError,
  mapGraphQLError,
} = useStock()

const showForm = ref(false)
const selectedVaccine = ref<StockOverviewItem | null>(null)
const formError = ref<string | null>(null)

const adjustmentTypeOptions = [
  { label: 'Aanvullen', value: StockAdjustmentType.Restock },
  { label: 'Verlagen', value: StockAdjustmentType.ManualDecrease },
  { label: 'Correctie', value: StockAdjustmentType.ManualCorrection },
]

type AdjustForm = {
  type: StockAdjustmentType
  quantityDelta: number
  reason: string
}

const schema = computed(() =>
  z
    .object({
      type: z.nativeEnum(StockAdjustmentType),
      quantityDelta: z.number().int(),
      reason: z.string().trim().min(1, 'Reden is verplicht.').max(500),
    })
    .superRefine((data, ctx) => {
      if (data.type === StockAdjustmentType.ManualCorrection) {
        if (data.quantityDelta < 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'Voorraad mag niet negatief zijn.',
            path: ['quantityDelta'],
          })
        }

        if (
          selectedVaccine.value &&
          data.quantityDelta === selectedVaccine.value.stockQuantity
        ) {
          ctx.addIssue({
            code: 'custom',
            message: 'Voorraad is al gelijk aan deze waarde.',
            path: ['quantityDelta'],
          })
        }

        return
      }

      if (data.quantityDelta === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Aantal mag niet nul zijn.',
          path: ['quantityDelta'],
        })
      }
    }),
)

const state = reactive<Partial<AdjustForm>>({
  type: StockAdjustmentType.Restock,
  quantityDelta: undefined,
  reason: undefined,
})

const quantityFieldLabel = computed(() =>
  state.type === StockAdjustmentType.ManualCorrection
    ? 'Nieuwe voorraad (dosissen)'
    : 'Aantal (dosissen)',
)

const formTitle = computed(() =>
  selectedVaccine.value
    ? `Voorraad aanpassen — ${selectedVaccine.value.name}`
    : 'Voorraad aanpassen',
)

void loadStockOverview(true)

function isLowStock(vaccine: StockOverviewItem): boolean {
  return vaccine.stockQuantity <= vaccine.stockWarningThreshold
}

function openAdjustForm(vaccine: StockOverviewItem) {
  selectedVaccine.value = vaccine
  state.type = StockAdjustmentType.Restock
  state.quantityDelta = undefined
  state.reason = undefined
  formError.value = null
  showForm.value = true
}

watch(
  () => state.type,
  type => {
    if (
      type === StockAdjustmentType.ManualCorrection &&
      selectedVaccine.value
    ) {
      state.quantityDelta = selectedVaccine.value.stockQuantity
    }
  },
)

function closeForm() {
  showForm.value = false
  selectedVaccine.value = null
  formError.value = null
}

function normalizeDelta(type: StockAdjustmentType, rawDelta: number): number {
  if (type === StockAdjustmentType.Restock) {
    return Math.abs(rawDelta)
  }

  return -Math.abs(rawDelta)
}

function buildAdjustInput(
  vaccineId: string,
  type: StockAdjustmentType,
  quantityDelta: number,
  reason: string,
) {
  if (type === StockAdjustmentType.ManualCorrection) {
    return {
      vaccineId,
      type,
      targetQuantity: quantityDelta,
      reason,
    }
  }

  return {
    vaccineId,
    type,
    quantityDelta: normalizeDelta(type, quantityDelta),
    reason,
  }
}

async function onSubmit(event: FormSubmitEvent<AdjustForm>) {
  if (!selectedVaccine.value) {
    return
  }

  formError.value = null

  try {
    await adjustStock(
      buildAdjustInput(
        selectedVaccine.value.id,
        event.data.type,
        event.data.quantityDelta,
        event.data.reason,
      ),
    )

    closeForm()
  } catch (error: unknown) {
    if (isInsufficientStockError(error)) {
      formError.value = 'Onvoldoende voorraad voor deze aanpassing.'
    } else if (isInvalidStockAdjustmentError(error)) {
      formError.value = 'Ongeldige voorraadaanpassing. Controleer type en aantal.'
    } else {
      formError.value = mapGraphQLError(error)
    }
  }
}

function openHistory(vaccineId: string): void {
  void router.push(`/admin/stock/${vaccineId}/history`)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">Voorraadbeheer</h2>
    </div>

    <UAlert
      v-if="successMessage"
      color="success"
      variant="subtle"
      :title="successMessage"
    />

    <UAlert
      v-if="errorMessage && !showForm"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />

    <CommonLoadingSkeleton v-if="loading && overview.length === 0" />

    <CommonErrorState
      v-else-if="errorMessage && overview.length === 0"
      title="Voorraad laden mislukt"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="overview.length === 0"
      title="Geen vaccins"
      description="Er zijn geen vaccins om voorraad voor te beheren."
    />

    <div v-else class="space-y-4">
      <UCard v-for="vaccine in overview" :key="vaccine.id">
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="space-y-2 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">{{ vaccine.name }}</h3>
              <UBadge
                v-if="isLowStock(vaccine)"
                color="warning"
                variant="subtle"
              >
                Lage voorraad
              </UBadge>
              <UBadge
                :color="vaccine.active ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ vaccine.active ? 'Actief' : 'Inactief' }}
              </UBadge>
            </div>
            <p>
              <span class="font-medium">Huidige voorraad:</span>
              {{ vaccine.stockQuantity }}
            </p>
            <p>
              <span class="font-medium">Waarschuwing drempel:</span>
              {{ vaccine.stockWarningThreshold }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton size="sm" @click="openAdjustForm(vaccine)">
              Aanpassen
            </UButton>
            <UButton
              size="sm"
              variant="outline"
              @click="openHistory(vaccine.id)"
            >
              Historiek
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="showForm" :title="formTitle">
      <template #body>
        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField label="Type aanpassing" name="type">
            <USelect
              v-model="state.type"
              :items="adjustmentTypeOptions"
              value-key="value"
              label-key="label"
            />
          </UFormField>

          <UFormField :label="quantityFieldLabel" name="quantityDelta">
            <UInput
              v-model.number="state.quantityDelta"
              type="number"
              autocomplete="off"
            />
          </UFormField>

          <UFormField label="Reden" name="reason">
            <UTextarea v-model="state.reason" :rows="3" />
          </UFormField>

          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />

          <div class="flex gap-2">
            <UButton type="submit" :loading="adjusting">Opslaan</UButton>
            <UButton color="neutral" variant="ghost" @click="closeForm">
              Annuleren
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
