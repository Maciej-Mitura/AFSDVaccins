<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { VaccineImageOverrideDecision } from '@/api/vaccine-image-rest'
import { VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH } from '@/api/vaccine-image-rest'
import VaccineImageStatusDetails from '@/components/vaccines/VaccineImageStatusDetails.vue'
import VaccineImageThumbnail from '@/components/vaccines/VaccineImageThumbnail.vue'
import {
  createVaccineImagePreviewController,
  formatVaccineImageFileSize,
  validateVaccineImageFile,
} from '@/composables/vaccine-image-file'
import { validateVaccineImageOverrideForm } from '@/composables/vaccine-image-override'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useVaccineImages } from '@/composables/useVaccineImages'
import { vaccineImageUploadOutcomeMessage } from '@/i18n/vaccine-image-status'
import type { VaccineImageListItem } from '@/composables/useVaccines'

export type AdminUploadPhase =
  'idle' | 'file_selected' | 'uploading' | 'analysing' | 'completed' | 'failed'

const props = defineProps<{
  vaccineId: string
  vaccineName: string
  image?: VaccineImageListItem | null
  /** When true, parent created the vaccine and this is the optional post-create step. */
  postCreate?: boolean
}>()

const emit = defineEmits<{
  done: []
  skipped: []
}>()

const { t } = useI18n()
const { isOnline } = useOnlineStatus()
const { upload, remove, override, refreshCatalogue, mapVaccineImageRestError } =
  useVaccineImages()

const preview = createVaccineImagePreviewController()

const selectedFile = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const phase = ref<AdminUploadPhase>('idle')
const clientError = ref<string | null>(null)
const apiError = ref<string | null>(null)
const outcomeMessage = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const showDeleteConfirm = ref(false)
const deleting = ref(false)

const showOverrideModal = ref(false)
const overrideDecision = ref<VaccineImageOverrideDecision | undefined>(
  undefined,
)
const overrideReason = ref('')
const overrideError = ref<string | null>(null)
const overriding = ref(false)
const showOverrideConfirm = ref(false)

/** Previous image stays visible until a replacement upload succeeds. */
const displayedImage = computed(() => props.image ?? null)

const hasImage = computed(() => Boolean(displayedImage.value))

const imageStatus = computed(() =>
  String(displayedImage.value?.validationStatus ?? ''),
)

const requestActive = computed(
  () =>
    phase.value === 'uploading' ||
    phase.value === 'analysing' ||
    deleting.value ||
    overriding.value,
)

const canOverride = computed(() => {
  const status = imageStatus.value
  return (
    status === 'REVIEW_REQUIRED' ||
    status === 'REJECTED' ||
    status === 'ACCEPTED' ||
    status === 'ANALYSIS_FAILED'
  )
})

const overrideDecisionOptions = computed(() => {
  const status = imageStatus.value
  const options: Array<{ value: VaccineImageOverrideDecision; label: string }> =
    []

  if (status === 'REVIEW_REQUIRED' || status === 'ANALYSIS_FAILED') {
    options.push({
      value: 'ACCEPTED',
      label: t('vaccines.image.override.accept'),
    })
    options.push({
      value: 'REJECTED',
      label: t('vaccines.image.override.reject'),
    })
  } else if (status === 'REJECTED') {
    options.push({
      value: 'ACCEPTED',
      label: t('vaccines.image.override.accept'),
    })
  } else if (status === 'ACCEPTED') {
    options.push({
      value: 'REJECTED',
      label: t('vaccines.image.override.reject'),
    })
  }

  return options
})

const overrideReasonTooLong = computed(
  () => overrideReason.value.length > VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH,
)

const overrideReasonEmpty = computed(
  () => overrideReason.value.trim().length === 0,
)

const canSubmitOverride = computed(
  () =>
    Boolean(overrideDecision.value) &&
    !overrideReasonEmpty.value &&
    !overrideReasonTooLong.value &&
    !overriding.value,
)

watch(
  () => props.vaccineId,
  () => {
    clearSelection()
    phase.value = 'idle'
    apiError.value = null
    outcomeMessage.value = null
  },
)

onBeforeUnmount(() => {
  preview.revoke()
})

function clearSelection(): void {
  preview.revoke()
  previewUrl.value = null
  selectedFile.value = null
  clientError.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  clientError.value = null
  apiError.value = null
  outcomeMessage.value = null

  const validation = validateVaccineImageFile(file)
  if (!validation.ok) {
    clearSelection()
    clientError.value = validation.message
    phase.value = 'idle'
    return
  }

  selectedFile.value = validation.file
  previewUrl.value = preview.select(validation.file)
  phase.value = 'file_selected'
}

function cancelSelection(): void {
  clearSelection()
  phase.value = hasImage.value ? 'idle' : 'idle'
}

async function submitUpload(): Promise<void> {
  if (!selectedFile.value || requestActive.value) {
    return
  }

  const validation = validateVaccineImageFile(selectedFile.value)
  if (!validation.ok) {
    clientError.value = validation.message
    return
  }

  phase.value = 'uploading'
  apiError.value = null
  outcomeMessage.value = null

  // Analysis runs in the same request — surface analysing wording shortly after start.
  const analysingTimer = window.setTimeout(() => {
    if (phase.value === 'uploading') {
      phase.value = 'analysing'
    }
  }, 400)

  try {
    const image = await upload(props.vaccineId, validation.file)
    window.clearTimeout(analysingTimer)
    clearSelection()
    phase.value = 'completed'
    outcomeMessage.value = vaccineImageUploadOutcomeMessage(
      image.validationStatus,
    )
  } catch (error: unknown) {
    window.clearTimeout(analysingTimer)
    phase.value = 'failed'
    apiError.value = mapVaccineImageRestError(error)
  }
}

function openFilePicker(): void {
  fileInputRef.value?.click()
}

function openDeleteConfirm(): void {
  showDeleteConfirm.value = true
}

async function confirmDelete(): Promise<void> {
  if (deleting.value) {
    return
  }
  deleting.value = true
  apiError.value = null
  try {
    await remove(props.vaccineId)
    showDeleteConfirm.value = false
    outcomeMessage.value = t('vaccines.image.delete.success')
    phase.value = 'idle'
  } catch (error: unknown) {
    apiError.value = mapVaccineImageRestError(error)
  } finally {
    deleting.value = false
  }
}

function openOverrideModal(): void {
  overrideDecision.value = undefined
  overrideReason.value = ''
  overrideError.value = null
  showOverrideConfirm.value = false
  showOverrideModal.value = true
}

function closeDeleteConfirm(): void {
  showDeleteConfirm.value = false
}

function closeOverrideModal(): void {
  showOverrideModal.value = false
}

function closeOverrideConfirm(): void {
  showOverrideConfirm.value = false
}

function requestOverrideConfirm(): void {
  overrideError.value = null
  const validation = validateVaccineImageOverrideForm({
    decision: overrideDecision.value,
    reason: overrideReason.value,
  })
  if (!validation.ok) {
    overrideError.value = validation.message
    return
  }
  showOverrideConfirm.value = true
}

async function confirmOverride(): Promise<void> {
  if (!canSubmitOverride.value || !overrideDecision.value) {
    return
  }

  overriding.value = true
  overrideError.value = null
  try {
    const image = await override(
      props.vaccineId,
      overrideDecision.value,
      overrideReason.value.trim(),
    )
    showOverrideConfirm.value = false
    showOverrideModal.value = false
    outcomeMessage.value = t('vaccines.image.override.success', {
      status: vaccineImageUploadOutcomeMessage(image.validationStatus),
    })
  } catch (error: unknown) {
    overrideError.value = mapVaccineImageRestError(error)
    showOverrideConfirm.value = false
  } finally {
    overriding.value = false
  }
}

async function onThumbnailUrlExpired(): Promise<void> {
  await refreshCatalogue(true)
}
</script>

<template>
  <div class="space-y-4" data-testid="vaccine-image-admin-panel">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
      <VaccineImageThumbnail
        :image="displayedImage"
        :vaccine-name="vaccineName"
        show-review-indicator
        :on-url-expired="onThumbnailUrlExpired"
      />

      <div class="min-w-0 flex-1 space-y-3">
        <h3 class="text-sm font-semibold">
          {{
            postCreate
              ? t('vaccines.image.postCreateTitle')
              : t('vaccines.image.sectionTitle')
          }}
        </h3>

        <p v-if="postCreate" class="text-sm text-muted">
          {{ t('vaccines.image.postCreateHint') }}
        </p>

        <p
          v-if="hasImage && phase === 'file_selected'"
          class="text-sm text-muted"
          data-testid="vaccine-image-replace-hint"
        >
          {{ t('vaccines.image.replaceHint') }}
        </p>

        <VaccineImageStatusDetails
          v-if="displayedImage"
          :validation-status="displayedImage.validationStatus"
          :ai-reason="displayedImage.aiReason"
          :ai-caption="displayedImage.aiCaption"
          :ai-confidence="displayedImage.aiConfidence"
          :ai-tags="displayedImage.aiTags"
        />

        <p v-else class="text-sm text-muted">
          {{ t('vaccines.image.none') }}
        </p>
      </div>
    </div>

    <div v-if="previewUrl && selectedFile" class="space-y-2">
      <p class="text-sm font-medium">{{ t('vaccines.image.preview') }}</p>
      <img
        :src="previewUrl"
        :alt="t('vaccines.image.previewAlt')"
        class="max-h-48 rounded-md border border-default object-contain"
        data-testid="vaccine-image-preview"
      />
      <p class="text-xs text-muted">
        {{ selectedFile.name }} ·
        {{ formatVaccineImageFileSize(selectedFile.size) }}
      </p>
    </div>

    <p
      v-if="phase === 'uploading' || phase === 'analysing'"
      class="text-sm"
      role="status"
      aria-live="polite"
      data-testid="vaccine-image-upload-status"
    >
      {{ t('vaccines.image.upload.analysing') }}
    </p>

    <UAlert
      v-if="outcomeMessage && phase !== 'failed'"
      color="success"
      variant="subtle"
      :title="outcomeMessage"
    />

    <UAlert
      v-if="clientError"
      color="error"
      variant="subtle"
      :title="clientError"
      data-testid="vaccine-image-client-error"
    />

    <UAlert
      v-if="apiError"
      color="error"
      variant="subtle"
      :title="apiError"
      data-testid="vaccine-image-api-error"
    />

    <input
      ref="fileInputRef"
      type="file"
      class="sr-only"
      accept="image/jpeg,image/png,image/webp"
      capture="environment"
      data-testid="vaccine-image-input"
      :aria-label="t('vaccines.image.select')"
      :disabled="requestActive"
      @change="onFileChange"
    />

    <div class="flex flex-wrap gap-2">
      <UButton
        size="sm"
        variant="outline"
        :disabled="!isOnline || requestActive"
        data-testid="vaccine-image-select-button"
        @click="openFilePicker"
      >
        {{
          hasImage ? t('vaccines.image.replace') : t('vaccines.image.upload')
        }}
      </UButton>

      <UButton
        v-if="selectedFile"
        size="sm"
        :loading="phase === 'uploading' || phase === 'analysing'"
        :disabled="!isOnline || requestActive"
        data-testid="vaccine-image-submit-button"
        @click="submitUpload"
      >
        {{ t('vaccines.image.submitUpload') }}
      </UButton>

      <UButton
        v-if="selectedFile"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="requestActive"
        data-testid="vaccine-image-cancel-selection"
        @click="cancelSelection"
      >
        {{ t('common.cancel') }}
      </UButton>

      <UButton
        v-if="phase === 'failed'"
        size="sm"
        color="warning"
        variant="soft"
        :disabled="!isOnline || !selectedFile || requestActive"
        data-testid="vaccine-image-retry-button"
        @click="submitUpload"
      >
        {{ t('common.retry') }}
      </UButton>

      <UButton
        v-if="hasImage"
        size="sm"
        color="error"
        variant="soft"
        :disabled="!isOnline || requestActive"
        data-testid="vaccine-image-delete-button"
        @click="openDeleteConfirm"
      >
        {{ t('vaccines.image.delete') }}
      </UButton>

      <UButton
        v-if="hasImage && canOverride"
        size="sm"
        color="neutral"
        variant="outline"
        :disabled="!isOnline || requestActive"
        data-testid="vaccine-image-override-button"
        @click="openOverrideModal"
      >
        {{ t('vaccines.image.override') }}
      </UButton>
    </div>

    <div
      v-if="postCreate"
      class="flex flex-wrap gap-2 border-t border-default pt-4"
    >
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        data-testid="vaccine-image-skip-button"
        @click="emit('skipped')"
      >
        {{ t('vaccines.image.skip') }}
      </UButton>
      <UButton
        size="sm"
        data-testid="vaccine-image-done-button"
        @click="emit('done')"
      >
        {{ t('vaccines.image.done') }}
      </UButton>
    </div>

    <UModal
      v-model:open="showDeleteConfirm"
      :title="t('vaccines.image.deleteConfirmTitle')"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            color="error"
            variant="subtle"
            :title="t('vaccines.image.deleteConfirmMessage')"
          />
          <div class="flex gap-2">
            <UButton
              color="error"
              :loading="deleting"
              :disabled="!isOnline"
              data-testid="vaccine-image-delete-confirm"
              @click="confirmDelete"
            >
              {{ t('common.delete') }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="deleting"
              @click="closeDeleteConfirm"
            >
              {{ t('common.cancel') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showOverrideModal"
      :title="t('vaccines.image.overrideTitle')"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField :label="t('vaccines.image.overrideDecision')">
            <USelect
              v-model="overrideDecision"
              :items="overrideDecisionOptions"
              value-key="value"
              label-key="label"
              :placeholder="t('vaccines.image.overrideDecisionPlaceholder')"
              data-testid="vaccine-image-override-decision"
            />
          </UFormField>

          <UFormField
            :label="t('vaccines.image.overrideReason')"
            :error="
              overrideReasonTooLong
                ? t('validation.image.overrideReason.maxLength')
                : undefined
            "
          >
            <UTextarea
              v-model="overrideReason"
              :rows="3"
              :maxlength="VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH"
              data-testid="vaccine-image-override-reason"
            />
            <p class="mt-1 text-xs text-muted">
              {{
                t('vaccines.image.overrideReasonCount', {
                  count: overrideReason.length,
                  max: VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH,
                })
              }}
            </p>
          </UFormField>

          <UAlert
            v-if="overrideError"
            color="error"
            variant="subtle"
            :title="overrideError"
          />

          <div class="flex gap-2">
            <UButton
              :disabled="!canSubmitOverride || !isOnline"
              data-testid="vaccine-image-override-prepare"
              @click="requestOverrideConfirm"
            >
              {{ t('common.confirm') }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="overriding"
              @click="closeOverrideModal"
            >
              {{ t('common.cancel') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="showOverrideConfirm"
      :title="t('vaccines.image.overrideConfirmTitle')"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm">
            {{ t('vaccines.image.overrideConfirmMessage') }}
          </p>
          <div class="flex gap-2">
            <UButton
              :loading="overriding"
              :disabled="!isOnline"
              data-testid="vaccine-image-override-confirm"
              @click="confirmOverride"
            >
              {{ t('common.confirm') }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="overriding"
              @click="closeOverrideConfirm"
            >
              {{ t('common.cancel') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
