<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useApplicationSettings } from '@/composables/useApplicationSettings'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useOrders } from '@/composables/useOrders'
import { useVaccines } from '@/composables/useVaccines'

type OrderLineDraft = {
  vaccineId: string
  quantity: number
}

const router = useRouter()
const { isOnline } = useOnlineStatus()
const { activeVaccines, loading: vaccinesLoading, loadVaccines } = useVaccines()
const {
  weeklySummary,
  loading: ordersLoading,
  errorMessage,
  loadWeeklySummary,
  createOrder,
  mapGraphQLError,
  isWeeklyLimitExceededError,
  isDailyLimitExceededError,
  isVaccineInactiveError,
} = useOrders()
const { settings, loadApplicationSettings } = useApplicationSettings()

const lines = ref<OrderLineDraft[]>([])
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const submitting = ref(false)

const schema = z.object({
  vaccineId: z.string().min(1, 'Selecteer een vaccin.'),
  quantity: z.number().int().min(1, 'Aantal moet minstens 1 zijn.'),
})

const state = reactive({
  vaccineId: undefined as string | undefined,
  quantity: 1,
})

const loading = computed(
  () => vaccinesLoading.value || ordersLoading.value || submitting.value,
)

void Promise.all([loadVaccines(false), loadApplicationSettings(), loadWeeklySummary()])

const closingTime = computed(
  () => settings.value?.orderingClosingTime ?? '14:00',
)

const weeklyLimit = computed(() => settings.value?.weeklyDoseCap ?? 200)
const dailyLimit = computed(() => settings.value?.dailyDoseCapPerType ?? 50)

function resetLineForm() {
  state.vaccineId = undefined
  state.quantity = 1
}

function addOrMergeLine(event: FormSubmitEvent<z.output<typeof schema>>) {
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
  return activeVaccines.value.find(vaccine => vaccine.id === vaccineId)?.name ?? vaccineId
}

function formatDeliveryDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

async function submitOrder() {
  formError.value = null
  successMessage.value = null

  if (lines.value.length === 0) {
    formError.value = 'Voeg minstens één bestelregel toe.'
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

    successMessage.value = `Bestelling geplaatst. Leverdatum: ${formatDeliveryDate(created.deliveryDate)}.`
    await router.push({ name: 'apotheker-orders' })
  } catch (error: unknown) {
    if (isWeeklyLimitExceededError(error)) {
      formError.value = `Het weekmaximum van ${weeklyLimit.value} dosissen is overschreden.`
    } else if (isDailyLimitExceededError(error)) {
      formError.value = `Het dagmaximum van ${dailyLimit.value} dosissen per vaccin is overschreden.`
    } else if (isVaccineInactiveError(error)) {
      formError.value = 'Een geselecteerd vaccin is niet meer beschikbaar.'
    } else {
      formError.value = mapGraphQLError(error)
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
        <h2 class="text-lg font-semibold">Nieuwe bestelling</h2>
      </template>

      <CommonLoadingSkeleton v-if="loading && !weeklySummary" />

      <div v-else class="space-y-4 text-sm">
        <UAlert
          color="info"
          variant="subtle"
          title="Leveringsregels"
          :description="`Bestellingen vóór ${closingTime} worden vandaag geleverd. Bestellingen vanaf ${closingTime} worden morgen geleverd.`"
        />

        <UAlert
          v-if="weeklySummary?.warningReached"
          color="warning"
          variant="subtle"
          title="Weekwaarschuwing"
          :description="`Je hebt ${weeklySummary.percentageUsed}% van het weekmaximum (${weeklySummary.weeklyLimit}) bereikt.`"
        />

        <div class="grid gap-2 sm:grid-cols-2">
          <p>
            <span class="font-medium">Week:</span>
            {{ weeklySummary?.isoWeek ?? '—' }} / {{ weeklySummary?.isoYear ?? '—' }}
          </p>
          <p>
            <span class="font-medium">Besteld deze week:</span>
            {{ weeklySummary?.orderedQuantity ?? 0 }} /
            {{ weeklySummary?.weeklyLimit ?? weeklyLimit }}
          </p>
          <p>
            <span class="font-medium">Resterend:</span>
            {{ weeklySummary?.remainingQuantity ?? weeklyLimit }}
          </p>
          <p>
            <span class="font-medium">Sluitingstijd:</span>
            {{ closingTime }} ({{ settings?.timezone ?? 'Europe/Brussels' }})
          </p>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">Bestelregels toevoegen</h3>
      </template>

      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="addOrMergeLine"
      >
        <UFormField label="Vaccin" name="vaccineId">
          <USelect
            v-model="state.vaccineId"
            :items="
              activeVaccines.map(vaccine => ({
                label: vaccine.name,
                value: vaccine.id,
              }))
            "
            placeholder="Selecteer vaccin"
          />
        </UFormField>

        <UFormField label="Aantal" name="quantity">
          <UInput v-model.number="state.quantity" type="number" min="1" />
        </UFormField>

        <UButton type="submit" variant="outline">Regel toevoegen</UButton>
      </UForm>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold">Huidige bestelling</h3>
      </template>

      <p v-if="lines.length === 0" class="text-sm text-muted">
        Nog geen regels toegevoegd.
      </p>

      <div v-else class="space-y-3">
        <div
          v-for="line in lines"
          :key="line.vaccineId"
          class="flex items-center justify-between rounded border border-default p-3 text-sm"
        >
          <div>
            <p class="font-medium">{{ vaccineName(line.vaccineId) }}</p>
            <p>{{ line.quantity }} dosissen</p>
          </div>
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            @click="removeLine(line.vaccineId)"
          >
            Verwijderen
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
          Bestelling plaatsen
        </UButton>
        <UButton to="/apotheker/orders" variant="ghost" color="neutral">
          Naar mijn bestellingen
        </UButton>
      </div>
    </UCard>
  </div>
</template>
