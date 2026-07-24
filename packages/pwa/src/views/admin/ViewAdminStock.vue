<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import type { FormSubmitEvent } from '@nuxt/ui'
import { StockAdjustmentType } from '@vaccin-delivery/types'
import * as z from 'zod'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useStock, type StockOverviewItem } from '@/composables/useStock'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { activeInactiveLabel } from '@/i18n'

const router = useRouter()
const { t } = useI18n()
const { isOnline } = useOnlineStatus()

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

const adjustmentTypeOptions = computed(() => [
  {
    label: t('admin.stock.adjustment.restock'),
    value: StockAdjustmentType.Restock,
  },
  {
    label: t('admin.stock.adjustment.decrease'),
    value: StockAdjustmentType.ManualDecrease,
  },
  {
    label: t('admin.stock.adjustment.correction'),
    value: StockAdjustmentType.ManualCorrection,
  },
])

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
      reason: z
        .string()
        .trim()
        .min(1, t('validation.reason.required'))
        .max(500),
    })
    .superRefine((data, ctx) => {
      if (data.type === StockAdjustmentType.ManualCorrection) {
        if (data.quantityDelta < 0) {
          ctx.addIssue({
            code: 'custom',
            message: t('validation.stock.nonNegative'),
            path: ['quantityDelta'],
          })
        }

        if (
          selectedVaccine.value &&
          data.quantityDelta === selectedVaccine.value.stockQuantity
        ) {
          ctx.addIssue({
            code: 'custom',
            message: t('validation.stock.unchanged'),
            path: ['quantityDelta'],
          })
        }

        return
      }

      if (data.quantityDelta === 0) {
        ctx.addIssue({
          code: 'custom',
          message: t('validation.quantity.nonZero'),
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
    ? t('admin.stock.quantityTarget')
    : t('admin.stock.quantity'),
)

const formTitle = computed(() =>
  selectedVaccine.value
    ? t('admin.stock.adjustTitleNamed', { name: selectedVaccine.value.name })
    : t('admin.stock.adjustTitle'),
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
      formError.value = t('errors.stock.insufficient')
    } else if (isInvalidStockAdjustmentError(error)) {
      formError.value = t('errors.stock.invalidAdjustment')
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
      <h2 class="text-lg font-semibold">{{ t('admin.stock.title') }}</h2>
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
      :title="t('admin.stock.loadFailed')"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="overview.length === 0"
      :title="t('admin.stock.empty.title')"
      :description="t('admin.stock.empty.description')"
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
                {{ t('admin.stock.lowStock') }}
              </UBadge>
              <UBadge
                :color="vaccine.active ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ activeInactiveLabel(vaccine.active) }}
              </UBadge>
            </div>
            <p>
              <span class="font-medium">{{ t('admin.stock.current') }}:</span>
              {{ vaccine.stockQuantity }}
            </p>
            <p>
              <span class="font-medium"
                >{{ t('admin.stock.warningThreshold') }}:</span
              >
              {{ vaccine.stockWarningThreshold }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              size="sm"
              :disabled="!isOnline"
              @click="openAdjustForm(vaccine)"
            >
              {{ t('admin.stock.adjust') }}
            </UButton>
            <UButton
              size="sm"
              variant="outline"
              @click="openHistory(vaccine.id)"
            >
              {{ t('admin.stock.history') }}
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
          <UFormField :label="t('admin.stock.adjustmentType')" name="type">
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

          <UFormField :label="t('admin.stock.reason')" name="reason">
            <UTextarea v-model="state.reason" :rows="3" />
          </UFormField>

          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />

          <div class="flex gap-2">
            <UButton type="submit" :loading="adjusting" :disabled="!isOnline">
              {{ t('common.save') }}
            </UButton>
            <UButton color="neutral" variant="ghost" @click="closeForm">
              {{ t('common.cancel') }}
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
