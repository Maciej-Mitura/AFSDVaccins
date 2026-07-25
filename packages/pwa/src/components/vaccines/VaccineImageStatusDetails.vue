<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  boundVaccineImageTags,
  formatVaccineImageConfidence,
  vaccineImageValidationStatusExplanation,
  vaccineImageValidationStatusLabel,
} from '@/i18n/vaccine-image-status'

const props = withDefaults(
  defineProps<{
    validationStatus: string
    aiReason?: string | null
    aiCaption?: string | null
    aiConfidence?: number | null
    aiTags?: string[] | null
    /** When false, only show status label (catalogue users). */
    showAiDetails?: boolean
  }>(),
  {
    aiReason: null,
    aiCaption: null,
    aiConfidence: null,
    aiTags: () => [],
    showAiDetails: true,
  },
)

const { t } = useI18n()

const statusLabel = computed(() =>
  vaccineImageValidationStatusLabel(props.validationStatus),
)

const explanation = computed(() =>
  vaccineImageValidationStatusExplanation(props.validationStatus),
)

const confidenceLabel = computed(() =>
  formatVaccineImageConfidence(props.aiConfidence),
)

const tags = computed(() => boundVaccineImageTags(props.aiTags))

const badgeColor = computed(() => {
  const status = String(props.validationStatus)
  if (status === 'ACCEPTED') {
    return 'success' as const
  }
  if (status === 'REVIEW_REQUIRED') {
    return 'warning' as const
  }
  if (status === 'REJECTED') {
    return 'error' as const
  }
  if (status === 'ANALYSIS_FAILED') {
    return 'neutral' as const
  }
  return 'info' as const
})
</script>

<template>
  <div class="space-y-2 text-sm" data-testid="vaccine-image-status">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-medium">{{ t('vaccines.image.statusLabel') }}:</span>
      <UBadge :color="badgeColor" variant="subtle">
        {{ statusLabel }}
      </UBadge>
    </div>

    <p class="text-muted">{{ explanation }}</p>

    <template v-if="showAiDetails">
      <p v-if="aiReason">
        <span class="font-medium">{{ t('vaccines.image.aiReason') }}:</span>
        {{ aiReason }}
      </p>
      <p v-if="aiCaption">
        <span class="font-medium">{{ t('vaccines.image.aiCaption') }}:</span>
        {{ aiCaption }}
      </p>
      <p v-if="confidenceLabel">
        <span class="font-medium">{{ t('vaccines.image.aiConfidence') }}:</span>
        {{ confidenceLabel }}
      </p>
      <p v-if="tags.length > 0">
        <span class="font-medium">{{ t('vaccines.image.aiTags') }}:</span>
        {{ tags.join(', ') }}
      </p>
    </template>
  </div>
</template>
