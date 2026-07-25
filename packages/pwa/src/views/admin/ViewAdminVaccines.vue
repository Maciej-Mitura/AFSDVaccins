<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import VaccineImageAdminPanel from '@/components/vaccines/VaccineImageAdminPanel.vue'
import VaccineImageThumbnail from '@/components/vaccines/VaccineImageThumbnail.vue'
import { useVaccines, type VaccineListItem } from '@/composables/useVaccines'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { activeInactiveLabel } from '@/i18n'

const { t } = useI18n()
const { isOnline } = useOnlineStatus()

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
/** After create: optional image step (upload failure does not undo vaccine). */
const postCreateImageStep = ref(false)
const editingVaccine = ref<VaccineListItem | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const togglingId = ref<string | null>(null)

const schema = computed(() =>
  z.object({
    name: z.string().trim().min(1, t('validation.name.required')).max(120),
    description: z.string().trim().max(500).optional(),
    manufacturer: z
      .string()
      .trim()
      .min(1, t('validation.manufacturer.required'))
      .max(120),
    stockWarningThreshold: z
      .number()
      .int()
      .min(0, t('validation.stockThreshold.nonNegative')),
  }),
)

type VaccineForm = {
  name: string
  description?: string
  manufacturer: string
  stockWarningThreshold: number
}

const state = reactive<Partial<VaccineForm>>({
  name: undefined,
  description: undefined,
  manufacturer: undefined,
  stockWarningThreshold: 0,
})

const formTitle = computed(() => {
  if (postCreateImageStep.value) {
    return t('vaccines.image.postCreateTitle')
  }
  return editingVaccine.value
    ? t('vaccines.editTitle')
    : t('vaccines.createTitle')
})

const liveEditingVaccine = computed(() => {
  if (!editingVaccine.value) {
    return null
  }
  return (
    vaccines.value.find(v => v.id === editingVaccine.value!.id) ??
    editingVaccine.value
  )
})

void loadVaccines(true)

function resetForm() {
  editingVaccine.value = null
  postCreateImageStep.value = false
  state.name = undefined
  state.description = undefined
  state.manufacturer = undefined
  state.stockWarningThreshold = 0
  formError.value = null
}

function openCreateForm() {
  resetForm()
  showForm.value = true
}

function openEditForm(vaccine: VaccineListItem) {
  editingVaccine.value = vaccine
  postCreateImageStep.value = false
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

function finishPostCreateStep() {
  successMessage.value = t('success.vaccines.created')
  closeForm()
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

    if (editingVaccine.value && !postCreateImageStep.value) {
      await updateVaccine(editingVaccine.value.id, payload)
      successMessage.value = t('success.vaccines.updated')
      closeForm()
    } else {
      const created = await createVaccine(payload)
      editingVaccine.value = created
      postCreateImageStep.value = true
    }
  } catch (error: unknown) {
    formError.value = isVaccineAlreadyExistsError(error)
      ? t('errors.vaccine.alreadyExists')
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

async function refreshSignedUrls(): Promise<void> {
  await loadVaccines(true)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">{{ t('vaccines.title') }}</h2>
      <UButton size="sm" :disabled="!isOnline" @click="openCreateForm">
        {{ t('vaccines.create') }}
      </UButton>
    </div>

    <UAlert
      v-if="formError && !showForm"
      color="error"
      variant="subtle"
      :title="formError"
    />

    <UAlert
      v-if="successMessage && !showForm"
      color="success"
      variant="subtle"
      :title="successMessage"
    />

    <CommonLoadingSkeleton v-if="loading && vaccines.length === 0" />

    <CommonErrorState
      v-else-if="errorMessage && vaccines.length === 0"
      :title="t('vaccines.loadFailed')"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="vaccines.length === 0"
      :title="t('vaccines.empty.title')"
      :description="t('vaccines.empty.description')"
    />

    <div v-else class="space-y-4">
      <UCard v-for="vaccine in vaccines" :key="vaccine.id">
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="flex min-w-0 flex-1 gap-3">
            <VaccineImageThumbnail
              :image="vaccine.image"
              :vaccine-name="vaccine.name"
              show-review-indicator
              :on-url-expired="refreshSignedUrls"
            />
            <div class="min-w-0 space-y-2 text-sm">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-semibold">{{ vaccine.name }}</h3>
                <UBadge
                  :color="vaccine.active ? 'success' : 'neutral'"
                  variant="subtle"
                >
                  {{ activeInactiveLabel(vaccine.active) }}
                </UBadge>
              </div>
              <p>{{ vaccine.description || t('common.noDescription') }}</p>
              <p>
                <span class="font-medium"
                  >{{ t('vaccines.manufacturer') }}:</span
                >
                {{ vaccine.manufacturer }}
              </p>
              <p>
                <span class="font-medium">{{ t('vaccines.stock') }}:</span>
                {{ vaccine.stockQuantity }}
                <span class="text-muted">{{
                  t('vaccines.stock.manageHint')
                }}</span>
              </p>
              <p>
                <span class="font-medium"
                  >{{ t('vaccines.stockWarningThreshold') }}:</span
                >
                {{ vaccine.stockWarningThreshold }}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton size="sm" variant="outline" @click="openEditForm(vaccine)">
              {{ t('common.edit') }}
            </UButton>
            <UButton
              size="sm"
              :color="vaccine.active ? 'warning' : 'success'"
              variant="soft"
              :loading="togglingId === vaccine.id"
              @click="toggleActive(vaccine)"
            >
              {{ vaccine.active ? t('admin.deactivate') : t('admin.activate') }}
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="showForm" :title="formTitle">
      <template #body>
        <div v-if="postCreateImageStep && liveEditingVaccine" class="space-y-4">
          <UAlert
            color="success"
            variant="subtle"
            :title="t('success.vaccines.created')"
          />
          <VaccineImageAdminPanel
            :vaccine-id="liveEditingVaccine.id"
            :vaccine-name="liveEditingVaccine.name"
            :image="liveEditingVaccine.image"
            post-create
            @done="finishPostCreateStep"
            @skipped="finishPostCreateStep"
          />
        </div>

        <UForm
          v-else
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField :label="t('common.name')" name="name">
            <UInput v-model="state.name" autocomplete="off" />
          </UFormField>

          <UFormField :label="t('common.description')" name="description">
            <UTextarea v-model="state.description" :rows="3" />
          </UFormField>

          <UFormField :label="t('vaccines.manufacturer')" name="manufacturer">
            <UInput v-model="state.manufacturer" autocomplete="off" />
          </UFormField>

          <UFormField
            :label="t('vaccines.stockWarningThreshold')"
            name="stockWarningThreshold"
          >
            <UInput
              v-model.number="state.stockWarningThreshold"
              type="number"
              min="0"
            />
          </UFormField>

          <VaccineImageAdminPanel
            v-if="liveEditingVaccine"
            :vaccine-id="liveEditingVaccine.id"
            :vaccine-name="liveEditingVaccine.name"
            :image="liveEditingVaccine.image"
            data-testid="vaccine-image-admin-controls"
          />

          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />

          <div class="flex gap-2">
            <UButton type="submit" :loading="saving" :disabled="!isOnline">
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
