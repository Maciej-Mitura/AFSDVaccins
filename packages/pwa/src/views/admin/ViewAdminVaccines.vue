<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import { useVaccines, type VaccineListItem } from '@/composables/useVaccines'

const {
  vaccines,
  loading,
  errorMessage,
  loadVaccines,
  createVaccine,
  updateVaccine,
  setVaccineActive,
  isVaccineAlreadyExistsError,
  mapGraphQLError,
} = useVaccines()

const showForm = ref(false)
const editingVaccine = ref<VaccineListItem | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const togglingId = ref<string | null>(null)

const schema = z.object({
  name: z.string().trim().min(1, 'Naam is verplicht.').max(120),
  description: z.string().trim().max(500).optional(),
  manufacturer: z.string().trim().min(1, 'Fabrikant is verplicht.').max(120),
  stockWarningThreshold: z
    .number()
    .int()
    .min(0, 'Drempel kan niet negatief zijn.'),
})

type VaccineForm = z.output<typeof schema>

const state = reactive<Partial<VaccineForm>>({
  name: undefined,
  description: undefined,
  manufacturer: undefined,
  stockWarningThreshold: 0,
})

const formTitle = computed(() =>
  editingVaccine.value ? 'Vaccin bewerken' : 'Nieuw vaccin',
)

void loadVaccines(true)

function resetForm() {
  editingVaccine.value = null
  state.name = undefined
  state.description = undefined
  state.manufacturer = undefined
  state.stockWarningThreshold = 0
  formError.value = null
  successMessage.value = null
}

function openCreateForm() {
  resetForm()
  showForm.value = true
}

function openEditForm(vaccine: VaccineListItem) {
  editingVaccine.value = vaccine
  state.name = vaccine.name
  state.description = vaccine.description
  state.manufacturer = vaccine.manufacturer
  state.stockWarningThreshold = vaccine.stockWarningThreshold
  formError.value = null
  successMessage.value = null
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  resetForm()
}

async function onSubmit(event: FormSubmitEvent<VaccineForm>) {
  saving.value = true
  formError.value = null
  successMessage.value = null

  try {
    const payload = {
      name: event.data.name,
      description: event.data.description ?? '',
      manufacturer: event.data.manufacturer,
      stockWarningThreshold: event.data.stockWarningThreshold,
    }

    if (editingVaccine.value) {
      await updateVaccine(editingVaccine.value.id, payload)
      successMessage.value = 'Vaccin bijgewerkt.'
    } else {
      await createVaccine(payload)
      successMessage.value = 'Vaccin aangemaakt.'
    }

    closeForm()
  } catch (error: unknown) {
    formError.value = isVaccineAlreadyExistsError(error)
      ? 'Er bestaat al een vaccin met deze naam.'
      : mapGraphQLError(error)
  } finally {
    saving.value = false
  }
}

async function toggleActive(vaccine: VaccineListItem) {
  togglingId.value = vaccine.id
  formError.value = null

  try {
    await setVaccineActive(vaccine.id, !vaccine.active)
  } catch (error: unknown) {
    formError.value = mapGraphQLError(error)
  } finally {
    togglingId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">Vaccincatalogus</h2>
      <UButton size="sm" @click="openCreateForm">Nieuw vaccin</UButton>
    </div>

    <UAlert
      v-if="formError && !showForm"
      color="error"
      variant="subtle"
      :title="formError"
    />

    <CommonLoadingSkeleton v-if="loading && vaccines.length === 0" />

    <CommonErrorState
      v-else-if="errorMessage && vaccines.length === 0"
      title="Catalogus laden mislukt"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="vaccines.length === 0"
      title="Geen vaccins"
      description="Maak het eerste vaccin aan om de catalogus te starten."
    />

    <div v-else class="space-y-4">
      <UCard v-for="vaccine in vaccines" :key="vaccine.id">
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="space-y-2 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold">{{ vaccine.name }}</h3>
              <UBadge
                :color="vaccine.active ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ vaccine.active ? 'Actief' : 'Inactief' }}
              </UBadge>
            </div>
            <p>{{ vaccine.description || 'Geen beschrijving' }}</p>
            <p>
              <span class="font-medium">Fabrikant:</span>
              {{ vaccine.manufacturer }}
            </p>
            <p>
              <span class="font-medium">Voorraad:</span>
              {{ vaccine.stockQuantity }}
              <span class="text-muted">(beheer via Voorraad)</span>
            </p>
            <p>
              <span class="font-medium">Lage-voorraad drempel:</span>
              {{ vaccine.stockWarningThreshold }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton size="sm" variant="outline" @click="openEditForm(vaccine)">
              Bewerken
            </UButton>
            <UButton
              size="sm"
              :color="vaccine.active ? 'warning' : 'success'"
              variant="soft"
              :loading="togglingId === vaccine.id"
              @click="toggleActive(vaccine)"
            >
              {{ vaccine.active ? 'Deactiveren' : 'Activeren' }}
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
          <UFormField label="Naam" name="name">
            <UInput v-model="state.name" autocomplete="off" />
          </UFormField>

          <UFormField label="Beschrijving" name="description">
            <UTextarea v-model="state.description" :rows="3" />
          </UFormField>

          <UFormField label="Fabrikant" name="manufacturer">
            <UInput v-model="state.manufacturer" autocomplete="off" />
          </UFormField>

          <UFormField
            label="Lage-voorraad drempel"
            name="stockWarningThreshold"
          >
            <UInput
              v-model.number="state.stockWarningThreshold"
              type="number"
              min="0"
            />
          </UFormField>

          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />

          <div class="flex gap-2">
            <UButton type="submit" :loading="saving">Opslaan</UButton>
            <UButton color="neutral" variant="ghost" @click="closeForm">
              Annuleren
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
