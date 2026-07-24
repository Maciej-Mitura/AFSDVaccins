<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useApplicationSettings } from '@/composables/useApplicationSettings'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useOrders } from '@/composables/useOrders'
import { useVaccines } from '@/composables/useVaccines'
import { formatDate, mapUserFacingGraphQLError, translatePlural } from '@/i18n'

type OrderLineDraft = {
  vaccineId: string
  quantity: number
}

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
  loading: ordersLoading,
  errorMessage,
  loadWeeklySummary,
  createOrder,
  isWeeklyLimitExceededError,
  isDailyLimitExceededError,
  isVaccineInactiveError,
} = useOrders()
const { settings, loadApplicationSettings } = useApplicationSettings()

const lines = ref<OrderLineDraft[]>([])
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const submitting = ref(false)

const schema = computed(() =>
  z.object({
    vaccineId: z.string().min(1, t('validation.vaccine.required')),
    quantity: z.number().int().min(1, t('validation.quantity.min')),
  }),
)

const state = reactive<Partial<OrderLineForm>>({
  vaccineId: undefined,
  quantity: 1,
})

const loading = computed(
  () => vaccinesLoading.value || ordersLoading.value || submitting.value,
)

void Promise.all([
  loadVaccines(false),
  loadApplicationSettings(),
  loadWeeklySummary(),
])

const closingTime = computed(
  () => settings.value?.orderingClosingTime ?? '14:00',
)

const weeklyLimit = computed(() => settings.value?.weeklyDoseCap ?? 200)
const dailyLimit = computed(() => settings.value?.dailyDoseCapPerType ?? 50)

function resetLineForm() {
  state.vaccineId = undefined
  state.quantity = 1
}

function addOrMergeLine(event: FormSubmitEvent<OrderLineForm>) {
  formError.value = null
  const vaccineId = event.data.vaccineId
  const nextQuantity = event.data.quantity
  const existing = lines.value.find(line => line.vaccineId === vaccineId)

  if (existing) {
    existing.quantity += nextQuantity
  } else {
    lines.value.push({ vaccineId, quantity: nextQuantity })
  }

  resetLineForm()
}

function removeLine(vaccineId: string) {
  lines.value = lines.value.filter(line => line.vaccineId !== vaccineId)
}

function vaccineName(vaccineId: string): string {
  return (
    activeVaccines.value.find(vaccine => vaccine.id === vaccineId)?.name ??
    vaccineId
  )
}

async function submitOrder() {
  formError.value = null
  successMessage.value = null

  if (lines.value.length === 0) {
    formError.value = t('apotheker.orders.create.linesRequired')
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
      formError.value = t('errors.order.dailyLimitExceeded', {
        limit: dailyLimit.value,
      })
    } else if (isVaccineInactiveError(error)) {
      formError.value = t('errors.order.vaccineInactive')
    } else {
      formError.value = mapUserFacingGraphQLError(error)
    }
  } finally {
    submitting.value = false
  }
}
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
            :items="
              activeVaccines.map(vaccine => ({
                label: vaccine.name,
                value: vaccine.id,
              }))
            "
            :placeholder="t('vaccines.selectPlaceholder')"
          />
        </UFormField>

        <UFormField :label="t('common.quantity')" name="quantity">
          <UInput v-model.number="state.quantity" type="number" min="1" />
        </UFormField>

        <UButton type="submit" variant="outline">{{
          t('apotheker.orders.create.addLine')
        }}</UButton>
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
          :key="line.vaccineId"
          class="flex items-center justify-between rounded border border-default p-3 text-sm"
        >
          <div>
            <p class="font-medium">{{ vaccineName(line.vaccineId) }}</p>
            <p>
              {{ translatePlural('admin.orders.totalDoses', line.quantity) }}
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
      </div>

      <UAlert
        v-if="formError"
        class="mt-4"
        color="error"
        variant="subtle"
        :title="formError"
      />
      <UAlert
        v-if="successMessage"
        class="mt-4"
        color="success"
        variant="subtle"
        :title="successMessage"
      />
      <UAlert
        v-else-if="errorMessage"
        class="mt-4"
        color="error"
        variant="subtle"
        :title="errorMessage"
      />

      <div class="mt-4 flex gap-2">
        <UButton
          data-testid="place-order"
          :loading="submitting"
          :disabled="!isOnline || lines.length === 0"
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
