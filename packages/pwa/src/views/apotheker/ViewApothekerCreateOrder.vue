<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useApplicationSettings } from '@/composables/useApplicationSettings'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useOrders } from '@/composables/useOrders'
import { useVaccines } from '@/composables/useVaccines'
import { formatDate, mapUserFacingGraphQLError } from '@/i18n'
import {
  findAllowance,
  hasInvalidDraftLines,
  quantityExceedsAllowance,
  remainingForAdd,
  validateDraftLinesAgainstAllowances,
  type OrderLineDraft,
} from '@/views/apotheker/daily-order-allowance'

type OrderLineForm = {
  vaccineId: string
  quantity: number
}

const { t } = useI18n()
const router = useRouter()
const { isOnline } = useOnlineStatus()
const { activeVaccines, loading: vaccinesLoading, loadVaccines } = useVaccines()
const {
  weeklySummary,
  dailyAllowances,
  loading: ordersLoading,
  errorMessage,
  loadWeeklySummary,
  loadDailyAllowances,
  createOrder,
  isWeeklyLimitExceededError,
  isDailyLimitExceededError,
  extractDailyLimitExceededDetails,
  isVaccineInactiveError,
} = useOrders()
const { settings, loadApplicationSettings } = useApplicationSettings()

const lines = ref<OrderLineDraft[]>([])
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const submitting = ref(false)
const highlightedVaccineId = ref<string | null>(null)
const quantityInputRefs = ref<Record<string, HTMLInputElement | null>>({})
const addQuantityInputRef = ref<HTMLInputElement | null>(null)
const addQuantityError = ref<string | null>(null)
const lineQuantityErrors = ref<Record<string, string>>({})

const state = reactive<Partial<OrderLineForm>>({
  vaccineId: undefined,
  quantity: 1,
})

const loading = computed(
  () => vaccinesLoading.value || ordersLoading.value || submitting.value,
)

const allowances = computed(() => dailyAllowances.value?.allowances ?? [])

const weeklyLimit = computed(() => settings.value?.weeklyDoseCap ?? 200)
const closingTime = computed(
  () => settings.value?.orderingClosingTime ?? '14:00',
)

const selectedAllowance = computed(() =>
  state.vaccineId
    ? findAllowance(allowances.value, state.vaccineId)
    : undefined,
)

const existingDraftQuantity = computed(() => {
  if (!state.vaccineId) {
    return 0
  }

  return (
    lines.value.find(line => line.vaccineId === state.vaccineId)?.quantity ?? 0
  )
})

const addMaxQuantity = computed(() =>
  remainingForAdd(selectedAllowance.value, existingDraftQuantity.value),
)

const vaccineSelectItems = computed(() =>
  activeVaccines.value.map(vaccine => {
    const allowance = findAllowance(allowances.value, vaccine.id)
    const remaining = allowance?.remainingToday ?? 0
    const disabled = remaining <= 0

    return {
      label: disabled
        ? `${vaccine.name} (${t('apotheker.orders.create.noRemainingToday')})`
        : vaccine.name,
      value: vaccine.id,
      disabled,
    }
  }),
)

const draftLineErrors = computed(() =>
  validateDraftLinesAgainstAllowances(lines.value, allowances.value),
)

const hasInvalidLines = computed(() =>
  hasInvalidDraftLines(lines.value, allowances.value),
)

const canSubmit = computed(
  () =>
    isOnline.value &&
    lines.value.length > 0 &&
    !hasInvalidLines.value &&
    !submitting.value,
)

const schema = computed(() => {
  const max = Math.max(addMaxQuantity.value, 0)

  return z.object({
    vaccineId: z.string().min(1, t('validation.vaccine.required')),
    quantity: z
      .number({ message: t('validation.quantity.min') })
      .int()
      .min(1, t('validation.quantity.min'))
      .superRefine((value, ctx) => {
        if (max <= 0) {
          ctx.addIssue({
            code: 'custom',
            message: t('apotheker.orders.create.noRemainingToday'),
          })
          return
        }

        if (quantityExceedsAllowance(value, max)) {
          ctx.addIssue({
            code: 'custom',
            message: t('validation.quantity.exceedsDailyRemaining', {
              remaining: max,
            }),
          })
        }
      }),
  })
})

void Promise.all([
  loadVaccines(false),
  loadApplicationSettings(),
  loadWeeklySummary(),
  loadDailyAllowances(),
])

watch(
  () => state.vaccineId,
  () => {
    addQuantityError.value = null
    formError.value = null
    state.quantity = 1
  },
)

watch(
  draftLineErrors,
  errors => {
    const next: Record<string, string> = {}

    for (const [vaccineId, code] of errors) {
      const allowance = findAllowance(allowances.value, vaccineId)
      const remaining = allowance?.remainingToday ?? 0

      if (code === 'none-remaining') {
        next[vaccineId] = t('apotheker.orders.create.noRemainingToday')
      } else if (code === 'exceeds') {
        next[vaccineId] = t('validation.quantity.exceedsDailyRemaining', {
          remaining,
        })
      } else {
        next[vaccineId] = t('validation.quantity.min')
      }
    }

    lineQuantityErrors.value = next
  },
  { immediate: true },
)

function resetLineForm() {
  state.vaccineId = undefined
  state.quantity = 1
  addQuantityError.value = null
}

function setQuantityInputRef(vaccineId: string, el: unknown): void {
  if (el instanceof HTMLInputElement) {
    quantityInputRefs.value[vaccineId] = el
    return
  }

  if (
    el &&
    typeof el === 'object' &&
    '$el' in el &&
    (el as { $el?: unknown }).$el instanceof HTMLInputElement
  ) {
    quantityInputRefs.value[vaccineId] = (el as { $el: HTMLInputElement }).$el
    return
  }

  quantityInputRefs.value[vaccineId] = null
}

function setAddQuantityInputRef(el: unknown): void {
  if (el instanceof HTMLInputElement) {
    addQuantityInputRef.value = el
    return
  }

  if (
    el &&
    typeof el === 'object' &&
    '$el' in el &&
    (el as { $el?: unknown }).$el instanceof HTMLInputElement
  ) {
    addQuantityInputRef.value = (el as { $el: HTMLInputElement }).$el
    return
  }

  addQuantityInputRef.value = null
}

function validateAddQuantity(): boolean {
  const max = addMaxQuantity.value
  const quantity = state.quantity

  if (max <= 0) {
    addQuantityError.value = t('apotheker.orders.create.noRemainingToday')
    return false
  }

  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    addQuantityError.value = t('validation.quantity.min')
    return false
  }

  if (quantityExceedsAllowance(quantity, max)) {
    addQuantityError.value = t('validation.quantity.exceedsDailyRemaining', {
      remaining: max,
    })
    return false
  }

  addQuantityError.value = null
  return true
}

function onAddQuantityInput(): void {
  validateAddQuantity()
}

function addOrMergeLine(event: FormSubmitEvent<OrderLineForm>) {
  formError.value = null
  highlightedVaccineId.value = null

  const vaccineId = event.data.vaccineId
  const nextQuantity = event.data.quantity
  const allowance = findAllowance(allowances.value, vaccineId)
  const existing = lines.value.find(line => line.vaccineId === vaccineId)
  const currentDraft = existing?.quantity ?? 0
  const maxAdditional = remainingForAdd(allowance, currentDraft)

  if (!allowance || maxAdditional <= 0) {
    addQuantityError.value = t('apotheker.orders.create.noRemainingToday')
    return
  }

  if (quantityExceedsAllowance(nextQuantity, maxAdditional)) {
    addQuantityError.value = t('validation.quantity.exceedsDailyRemaining', {
      remaining: maxAdditional,
    })
    void nextTick(() => addQuantityInputRef.value?.focus())
    return
  }

  if (existing) {
    existing.quantity += nextQuantity
  } else {
    lines.value.push({ vaccineId, quantity: nextQuantity })
  }

  resetLineForm()
}

function removeLine(vaccineId: string) {
  lines.value = lines.value.filter(line => line.vaccineId !== vaccineId)
  if (highlightedVaccineId.value === vaccineId) {
    highlightedVaccineId.value = null
  }
}

function updateLineQuantity(vaccineId: string, rawValue: number | string) {
  const line = lines.value.find(item => item.vaccineId === vaccineId)
  if (!line) {
    return
  }

  const quantity =
    typeof rawValue === 'number'
      ? rawValue
      : Number.parseInt(String(rawValue), 10)
  line.quantity = Number.isFinite(quantity) ? quantity : Number.NaN
  formError.value = null
}

function vaccineName(vaccineId: string): string {
  return (
    findAllowance(allowances.value, vaccineId)?.vaccineName ??
    activeVaccines.value.find(vaccine => vaccine.id === vaccineId)?.name ??
    vaccineId
  )
}

function lineAllowance(vaccineId: string) {
  return findAllowance(allowances.value, vaccineId)
}

async function focusVaccineLine(vaccineId: string | undefined): Promise<void> {
  if (!vaccineId) {
    return
  }

  highlightedVaccineId.value = vaccineId
  await nextTick()
  quantityInputRefs.value[vaccineId]?.focus()
}

async function submitOrder() {
  formError.value = null
  successMessage.value = null
  highlightedVaccineId.value = null

  if (lines.value.length === 0) {
    formError.value = t('apotheker.orders.create.linesRequired')
    return
  }

  if (hasInvalidLines.value) {
    const firstInvalid = [...draftLineErrors.value.keys()][0]
    formError.value = t('apotheker.orders.create.reviewQuantities')
    await focusVaccineLine(firstInvalid)
    return
  }

  submitting.value = true

  try {
    const created = await createOrder({
      lines: lines.value.map(line => ({
        vaccineId: line.vaccineId,
        quantity: line.quantity,
      })),
    })

    successMessage.value = t('success.order.placed', {
      date: formatDate(created.deliveryDate),
    })
    await router.push({ name: 'apotheker-orders' })
  } catch (error: unknown) {
    if (isWeeklyLimitExceededError(error)) {
      formError.value = t('errors.order.weeklyLimitExceeded', {
        limit: weeklyLimit.value,
      })
    } else if (isDailyLimitExceededError(error)) {
      const details = extractDailyLimitExceededDetails(error)
      let refreshedRemaining = details?.remainingToday

      try {
        const refreshed = await loadDailyAllowances()
        if (details?.vaccineId) {
          refreshedRemaining =
            findAllowance(refreshed.allowances, details.vaccineId)
              ?.remainingToday ?? refreshedRemaining
        }
      } catch {
        // Keep form open with previous data; backend details still drive the message.
      }

      const remaining =
        typeof refreshedRemaining === 'number'
          ? refreshedRemaining
          : (details?.remainingToday ?? 0)

      formError.value = t('errors.order.dailyLimitExceededPrecise', {
        remaining,
      })

      if (details?.vaccineId) {
        const line = lines.value.find(
          item => item.vaccineId === details.vaccineId,
        )
        if (line && remaining >= 1 && line.quantity > remaining) {
          // Keep the user's entered quantity visible; mark invalid via allowance refresh.
        }
        await focusVaccineLine(details.vaccineId)
      }
    } else if (isVaccineInactiveError(error)) {
      formError.value = t('errors.order.vaccineInactive')
    } else {
      formError.value = mapUserFacingGraphQLError(error)
    }
  } finally {
    submitting.value = false
  }
}

defineExpose({
  state,
  lines,
  addQuantityError,
  formError,
  highlightedVaccineId,
  addOrMergeLine,
  submitOrder,
  updateLineQuantity,
  validateAddQuantity,
  canSubmit,
  hasInvalidLines,
  addMaxQuantity,
  selectedAllowance,
})
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">{{ t('apotheker.orders.new') }}</h2>
      </template>

      <CommonLoadingSkeleton v-if="loading && !weeklySummary" />

      <div v-else class="space-y-4 text-sm">
        <UAlert
          color="info"
          variant="subtle"
          :title="t('apotheker.orders.create.deliveryRules.title')"
          :description="
            t('apotheker.orders.create.deliveryRules.description', {
              time: closingTime,
            })
          "
        />

        <UAlert
          v-if="weeklySummary?.warningReached"
          color="warning"
          variant="subtle"
          :title="t('apotheker.orders.create.weekWarning.title')"
          :description="
            t('apotheker.orders.create.weekWarning.description', {
              percentage: weeklySummary.percentageUsed,
              limit: weeklySummary.weeklyLimit,
            })
          "
        />

        <div class="grid gap-2 sm:grid-cols-2">
          <p>
            <span class="font-medium"
              >{{ t('apotheker.orders.create.week') }}:</span
            >
            {{ weeklySummary?.isoWeek ?? '—' }} /
            {{ weeklySummary?.isoYear ?? '—' }}
          </p>
          <p>
            <span class="font-medium"
              >{{ t('apotheker.orders.create.orderedThisWeek') }}:</span
            >
            {{ weeklySummary?.orderedQuantity ?? 0 }} /
            {{ weeklySummary?.weeklyLimit ?? weeklyLimit }}
          </p>
          <p>
            <span class="font-medium"
              >{{ t('apotheker.orders.create.remaining') }}:</span
            >
            {{ weeklySummary?.remainingQuantity ?? weeklyLimit }}
          </p>
          <p>
            <span class="font-medium"
              >{{ t('apotheker.orders.create.closingTime') }}:</span
            >
            {{ closingTime }} ({{ settings?.timezone ?? 'Europe/Brussels' }})
          </p>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">
          {{ t('apotheker.orders.create.addLines') }}
        </h3>
      </template>

      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="addOrMergeLine"
      >
        <UFormField :label="t('vaccines.label')" name="vaccineId">
          <USelect
            v-model="state.vaccineId"
            data-testid="vaccine-select"
            :items="vaccineSelectItems"
            :placeholder="t('vaccines.selectPlaceholder')"
          />
        </UFormField>

        <div
          v-if="selectedAllowance"
          class="space-y-1 text-sm"
          data-testid="selected-vaccine-allowance"
        >
          <p>
            <span class="font-medium"
              >{{ t('apotheker.orders.create.dailyMaximum') }}:</span
            >
            {{ selectedAllowance.dailyMaximum }}
          </p>
          <p :id="`remaining-add-${selectedAllowance.vaccineId}`">
            {{
              t('apotheker.orders.create.remainingToday', {
                remaining: addMaxQuantity,
              })
            }}
          </p>
          <p
            v-if="selectedAllowance.remainingToday <= 0"
            class="text-error"
            data-testid="no-remaining-selected"
          >
            {{ t('apotheker.orders.create.noRemainingToday') }}
          </p>
        </div>

        <UFormField
          :label="t('common.quantity')"
          name="quantity"
          :error="addQuantityError ?? undefined"
          :hint="
            selectedAllowance
              ? t('apotheker.orders.create.requestedQuantity')
              : undefined
          "
        >
          <UInput
            :ref="setAddQuantityInputRef"
            v-model.number="state.quantity"
            type="number"
            min="1"
            :max="Math.max(addMaxQuantity, 1)"
            :disabled="!state.vaccineId || addMaxQuantity <= 0"
            :aria-describedby="
              selectedAllowance
                ? `remaining-add-${selectedAllowance.vaccineId}`
                : undefined
            "
            :aria-invalid="Boolean(addQuantityError)"
            data-testid="add-quantity-input"
            @update:model-value="onAddQuantityInput"
          />
        </UFormField>

        <UButton
          type="submit"
          variant="outline"
          :disabled="!state.vaccineId || addMaxQuantity <= 0"
          :title="
            addMaxQuantity <= 0
              ? t('apotheker.orders.create.noRemainingToday')
              : undefined
          "
        >
          {{ t('apotheker.orders.create.addLine') }}
        </UButton>
      </UForm>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">
          {{ t('apotheker.orders.create.current') }}
        </h3>
      </template>

      <p v-if="lines.length === 0" class="text-sm text-muted">
        {{ t('apotheker.orders.create.linesEmpty') }}
      </p>

      <div v-else class="space-y-3">
        <div
          v-for="line in lines"
          :id="`order-line-${line.vaccineId}`"
          :key="line.vaccineId"
          class="space-y-2 rounded border p-3 text-sm"
          :class="
            highlightedVaccineId === line.vaccineId
              ? 'border-error ring-2 ring-error/40'
              : 'border-default'
          "
          data-testid="order-line"
          :data-highlighted="
            highlightedVaccineId === line.vaccineId ? 'true' : undefined
          "
        >
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <p class="font-medium">{{ vaccineName(line.vaccineId) }}</p>
              <p>
                <span class="font-medium"
                  >{{ t('apotheker.orders.create.dailyMaximum') }}:</span
                >
                {{ lineAllowance(line.vaccineId)?.dailyMaximum ?? '—' }}
              </p>
              <p :id="`remaining-line-${line.vaccineId}`">
                {{
                  t('apotheker.orders.create.remainingToday', {
                    remaining:
                      lineAllowance(line.vaccineId)?.remainingToday ?? 0,
                  })
                }}
              </p>
              <p>
                <span class="font-medium"
                  >{{ t('apotheker.orders.create.requestedQuantity') }}:</span
                >
                {{ Number.isFinite(line.quantity) ? line.quantity : '—' }}
              </p>
            </div>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              @click="removeLine(line.vaccineId)"
            >
              {{ t('common.delete') }}
            </UButton>
          </div>

          <UFormField
            :label="t('common.quantity')"
            :name="`line-quantity-${line.vaccineId}`"
            :error="lineQuantityErrors[line.vaccineId]"
          >
            <UInput
              :ref="(el: unknown) => setQuantityInputRef(line.vaccineId, el)"
              :model-value="line.quantity"
              type="number"
              min="1"
              :max="
                Math.max(lineAllowance(line.vaccineId)?.remainingToday ?? 1, 1)
              "
              :aria-describedby="`remaining-line-${line.vaccineId}`"
              :aria-invalid="Boolean(lineQuantityErrors[line.vaccineId])"
              :data-testid="`line-quantity-${line.vaccineId}`"
              @update:model-value="
                value => updateLineQuantity(line.vaccineId, value as number)
              "
            />
          </UFormField>
        </div>
      </div>

      <UAlert
        v-if="formError"
        class="mt-4"
        color="error"
        variant="subtle"
        :title="formError"
        data-testid="create-order-form-error"
      />
      <UAlert
        v-if="successMessage"
        class="mt-4"
        color="success"
        variant="subtle"
        :title="successMessage"
      />
      <UAlert
        v-else-if="errorMessage && !formError"
        class="mt-4"
        color="error"
        variant="subtle"
        :title="errorMessage"
      />

      <div class="mt-4 flex gap-2">
        <UButton
          data-testid="place-order"
          :loading="submitting"
          :disabled="!canSubmit"
          :title="
            hasInvalidLines
              ? t('apotheker.orders.create.reviewQuantities')
              : undefined
          "
          @click="submitOrder"
        >
          {{ t('apotheker.orders.create.place') }}
        </UButton>
        <UButton to="/apotheker/orders" variant="ghost" color="neutral">
          {{ t('apotheker.orders.title') }}
        </UButton>
      </div>
    </UCard>
  </div>
</template>
