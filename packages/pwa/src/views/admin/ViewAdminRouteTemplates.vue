<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonErrorState from '@/components/common/CommonErrorState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import CommonPageHeader from '@/components/common/CommonPageHeader.vue'
import CommonPageSection from '@/components/common/CommonPageSection.vue'
import {
  useRouteTemplates,
  type RouteTemplateListItem,
} from '@/composables/useRouteTemplates'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { activeInactiveLabel } from '@/i18n'

const { t } = useI18n()
const { isOnline } = useOnlineStatus()

const {
  templates,
  apothekerProfiles,
  bezorgerProfiles,
  loading,
  profilesLoading,
  errorMessage,
  loadRouteTemplates,
  loadProfileOptions,
  createRouteTemplate,
  updateRouteTemplate,
  setRouteTemplateActive,
  findApothekerProfile,
  findBezorgerProfile,
  formatPharmacyLabel,
  isRouteTemplateAlreadyExistsError,
  isRouteTemplateDuplicateStopError,
  isRouteTemplateEmptyStopsError,
  mapGraphQLError,
} = useRouteTemplates()

const includeInactive = ref(true)
const showForm = ref(false)
const editingTemplate = ref<RouteTemplateListItem | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const togglingId = ref<string | null>(null)
const selectedPharmacyId = ref<string | undefined>(undefined)

const schema = computed(() =>
  z.object({
    name: z.string().trim().min(1, t('validation.name.required')).max(120),
    description: z.string().trim().max(500).optional(),
    bezorgerProfileId: z.string().min(1, t('validation.courier.required')),
  }),
)

type TemplateForm = {
  name: string
  description?: string
  bezorgerProfileId: string
}

const state = reactive<{
  name?: string
  description?: string
  bezorgerProfileId?: string
}>({
  name: undefined,
  description: undefined,
  bezorgerProfileId: undefined,
})

const stopIds = ref<string[]>([])

const formTitle = computed(() =>
  editingTemplate.value
    ? t('routes.templates.editTitle')
    : t('routes.templates.createTitle'),
)

const pharmacyOptions = computed(() =>
  apothekerProfiles.value.map(profile => ({
    label: formatPharmacyLabel(profile),
    value: profile.id,
  })),
)

const courierOptions = computed(() =>
  bezorgerProfiles.value.map(profile => ({
    label: profile.vehicleLabel
      ? `${profile.displayName} (${profile.vehicleLabel})`
      : profile.displayName,
    value: profile.id,
  })),
)

const availablePharmacyOptions = computed(() =>
  pharmacyOptions.value.filter(option => !stopIds.value.includes(option.value)),
)

const orderedStops = computed(() =>
  stopIds.value.map((id, index) => {
    const profile = findApothekerProfile(id)
    return {
      id,
      sequence: index + 1,
      label: profile ? formatPharmacyLabel(profile) : id,
    }
  }),
)

void Promise.all([
  loadRouteTemplates(includeInactive.value),
  loadProfileOptions(),
])

async function reloadTemplates() {
  await loadRouteTemplates(includeInactive.value)
}

async function toggleIncludeInactive() {
  includeInactive.value = !includeInactive.value
  await reloadTemplates()
}

function resetForm() {
  editingTemplate.value = null
  state.name = undefined
  state.description = undefined
  state.bezorgerProfileId = undefined
  stopIds.value = []
  selectedPharmacyId.value = undefined
  formError.value = null
}

function openCreateForm() {
  resetForm()
  successMessage.value = null
  showForm.value = true
}

function openEditForm(template: RouteTemplateListItem) {
  editingTemplate.value = template
  state.name = template.name
  state.description = template.description ?? undefined
  state.bezorgerProfileId = template.bezorgerProfileId
  stopIds.value = [...template.stops]
    .sort((a, b) => a.sequence - b.sequence)
    .map(stop => stop.apothekerProfileId)
  selectedPharmacyId.value = undefined
  formError.value = null
  successMessage.value = null
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  resetForm()
}

function addStop() {
  if (!selectedPharmacyId.value) {
    return
  }

  if (stopIds.value.includes(selectedPharmacyId.value)) {
    formError.value = t('errors.routeTemplate.duplicatePharmacy')
    return
  }

  stopIds.value = [...stopIds.value, selectedPharmacyId.value]
  selectedPharmacyId.value = undefined
  formError.value = null
}

function removeStop(index: number) {
  stopIds.value = stopIds.value.filter((_, stopIndex) => stopIndex !== index)
}

function moveStop(index: number, direction: -1 | 1) {
  const target = index + direction

  if (target < 0 || target >= stopIds.value.length) {
    return
  }

  const next = [...stopIds.value]
  const current = next[index]
  const swapWith = next[target]

  if (current === undefined || swapWith === undefined) {
    return
  }

  next[index] = swapWith
  next[target] = current
  stopIds.value = next
}

function mapFormError(error: unknown): string {
  if (isRouteTemplateAlreadyExistsError(error)) {
    return t('errors.routeTemplate.alreadyExists')
  }

  if (isRouteTemplateDuplicateStopError(error)) {
    return t('errors.routeTemplate.duplicateStop')
  }

  if (isRouteTemplateEmptyStopsError(error)) {
    return t('errors.routeTemplate.emptyStops')
  }

  return mapGraphQLError(error)
}

async function onSubmit(event: FormSubmitEvent<TemplateForm>) {
  if (stopIds.value.length === 0) {
    formError.value = t('errors.routeTemplate.emptyStops')
    return
  }

  saving.value = true
  formError.value = null
  successMessage.value = null

  try {
    const payload = {
      name: event.data.name,
      description: event.data.description ?? null,
      bezorgerProfileId: event.data.bezorgerProfileId,
      stops: stopIds.value.map(apothekerProfileId => ({ apothekerProfileId })),
    }

    if (editingTemplate.value) {
      const outcome = await updateRouteTemplate(editingTemplate.value.id, payload)
      successMessage.value =
        outcome.deactivatedTemplateIds.length > 0
          ? t('success.routes.template.updatedWithDeactivation')
          : t('success.routes.template.updated')
    } else {
      const outcome = await createRouteTemplate(payload)
      successMessage.value =
        outcome.deactivatedTemplateIds.length > 0
          ? t('success.routes.template.createdWithDeactivation')
          : t('success.routes.template.created')
    }

    closeForm()
    await reloadTemplates()
  } catch (error: unknown) {
    formError.value = mapFormError(error)
  } finally {
    saving.value = false
  }
}

async function toggleActive(template: RouteTemplateListItem) {
  togglingId.value = template.id
  formError.value = null

  try {
    const outcome = await setRouteTemplateActive(template.id, !template.active)
    if (!template.active) {
      successMessage.value =
        outcome.deactivatedTemplateIds.length > 0
          ? t('success.routes.template.activatedWithDeactivation')
          : t('success.routes.template.activated')
    } else {
      successMessage.value = t('success.routes.template.deactivated')
    }
    await reloadTemplates()
  } catch (error: unknown) {
    formError.value = mapGraphQLError(error)
  } finally {
    togglingId.value = null
  }
}

function courierLabel(bezorgerProfileId: string): string {
  const profile = findBezorgerProfile(bezorgerProfileId)
  return profile?.displayName ?? bezorgerProfileId
}

function stopSummary(template: RouteTemplateListItem): string {
  return [...template.stops]
    .sort((a, b) => a.sequence - b.sequence)
    .map(stop => {
      const profile = findApothekerProfile(stop.apothekerProfileId)
      return profile
        ? `${stop.sequence}. ${profile.pharmacyName}`
        : `${stop.sequence}. ${stop.apothekerProfileId}`
    })
    .join(' → ')
}
</script>

<template>
  <div class="space-y-8">
    <CommonPageHeader :title="t('routes.templates.title')">
      <template #actions>
        <UButton
          size="sm"
          :variant="includeInactive ? 'soft' : 'ghost'"
          color="neutral"
          @click="toggleIncludeInactive"
        >
          {{
            includeInactive
              ? t('routes.templates.filter.includeInactive')
              : t('routes.templates.filter.activeOnly')
          }}
        </UButton>
        <UButton
          size="sm"
          class="min-h-11 sm:min-h-0"
          :disabled="!isOnline"
          @click="openCreateForm"
        >
          {{ t('routes.templates.create') }}
        </UButton>
      </template>
    </CommonPageHeader>

    <UAlert
      v-if="successMessage"
      color="success"
      variant="subtle"
      :title="successMessage"
    />

    <UAlert
      v-if="formError && !showForm"
      color="error"
      variant="subtle"
      :title="formError"
    />

    <CommonLoadingSkeleton
      v-if="(loading || profilesLoading) && templates.length === 0"
    />

    <CommonErrorState
      v-else-if="errorMessage && templates.length === 0"
      :title="t('routes.templates.loadFailed')"
      :description="errorMessage"
    />

    <CommonEmptyState
      v-else-if="templates.length === 0"
      :title="t('routes.templates.empty.title')"
      :description="t('routes.templates.empty.description')"
    />

    <CommonPageSection v-else>
      <ul class="divide-y divide-default" role="list">
        <li
          v-for="template in templates"
          :key="template.id"
          class="flex flex-col gap-4 py-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="min-w-0 space-y-2 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold text-highlighted">{{ template.name }}</h3>
              <UBadge
                :color="template.active ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ activeInactiveLabel(template.active) }}
              </UBadge>
            </div>
            <p class="text-toned">
              {{ template.description || t('common.noDescription') }}
            </p>
            <p class="text-toned">
              <span class="font-medium text-highlighted"
                >{{ t('routes.courier') }}:</span
              >
              {{ courierLabel(template.bezorgerProfileId) }}
            </p>
            <p class="break-words text-toned">
              <span class="font-medium text-highlighted"
                >{{ t('routes.templates.stops') }}:</span
              >
              {{ stopSummary(template) }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              size="sm"
              variant="outline"
              @click="openEditForm(template)"
            >
              {{ t('common.edit') }}
            </UButton>
            <UButton
              size="sm"
              :color="template.active ? 'warning' : 'success'"
              variant="soft"
              :loading="togglingId === template.id"
              @click="toggleActive(template)"
            >
              {{
                template.active ? t('admin.deactivate') : t('admin.activate')
              }}
            </UButton>
          </div>
        </li>
      </ul>
    </CommonPageSection>

    <UModal v-model:open="showForm" :title="formTitle">
      <template #body>
        <UForm
          :schema="schema"
          :state="state"
          class="max-h-[min(80vh,40rem)] space-y-4 overflow-y-auto overscroll-contain pr-1"
          @submit="onSubmit"
        >
          <UFormField :label="t('common.name')" name="name">
            <UInput v-model="state.name" autocomplete="off" />
          </UFormField>

          <UFormField :label="t('common.description')" name="description">
            <UTextarea v-model="state.description" :rows="2" />
          </UFormField>

          <UFormField :label="t('routes.courier')" name="bezorgerProfileId">
            <USelect
              v-model="state.bezorgerProfileId"
              :items="courierOptions"
              :placeholder="t('routes.templates.courierPlaceholder')"
              class="w-full"
            />
          </UFormField>

          <div class="space-y-3">
            <p class="text-sm font-medium text-highlighted">
              {{ t('routes.templates.stops.label') }}
            </p>

            <div class="flex flex-col gap-2 sm:flex-row">
              <USelect
                v-model="selectedPharmacyId"
                :items="availablePharmacyOptions"
                :placeholder="t('routes.templates.pharmacyPlaceholder')"
                class="w-full min-w-0"
              />
              <UButton
                type="button"
                variant="soft"
                class="min-h-11 shrink-0 sm:min-h-0"
                :disabled="!selectedPharmacyId"
                @click="addStop"
              >
                {{ t('common.add') }}
              </UButton>
            </div>

            <CommonEmptyState
              v-if="orderedStops.length === 0"
              :title="t('routes.templates.stops.empty.title')"
              :description="t('routes.templates.stops.empty.description')"
            />

            <ul v-else class="divide-y divide-default" role="list">
              <li
                v-for="(stop, index) in orderedStops"
                :key="stop.id"
                class="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="min-w-0 break-words">
                  <span class="font-medium text-highlighted"
                    >{{ stop.sequence }}.</span
                  >
                  {{ stop.label }}
                </div>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    size="xs"
                    variant="ghost"
                    :disabled="index === 0"
                    @click="moveStop(index, -1)"
                  >
                    {{ t('routes.templates.moveUp') }}
                  </UButton>
                  <UButton
                    size="xs"
                    variant="ghost"
                    :disabled="index === orderedStops.length - 1"
                    @click="moveStop(index, 1)"
                  >
                    {{ t('routes.templates.moveDown') }}
                  </UButton>
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    @click="removeStop(index)"
                  >
                    {{ t('common.delete') }}
                  </UButton>
                </div>
              </li>
            </ul>
          </div>

          <UAlert
            v-if="formError"
            color="error"
            variant="subtle"
            :title="formError"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              class="min-h-11"
              :loading="saving"
              :disabled="!isOnline"
            >
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
