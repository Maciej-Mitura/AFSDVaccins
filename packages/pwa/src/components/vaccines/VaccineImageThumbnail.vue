<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { isVaccineImageBrowseable } from '@/i18n/vaccine-image-status'

export type VaccineImageThumbnailSource = {
  imageUrl?: string | null
  validationStatus?: string | null
} | null

const props = withDefaults(
  defineProps<{
    image?: VaccineImageThumbnailSource
    vaccineName: string
    /** Show subtle REVIEW_REQUIRED indicator (admin catalogues). */
    showReviewIndicator?: boolean
    /**
     * Called at most once when a signed URL fails to load.
     * Parent should refetch GraphQL for a fresh SAS URL.
     */
    onUrlExpired?: () => void | Promise<void>
  }>(),
  {
    image: null,
    showReviewIndicator: false,
  },
)

const { t } = useI18n()

const imageLoaded = ref(false)
const imageBroken = ref(false)
const refetchAttempted = ref(false)
const refetching = ref(false)

const browseableUrl = computed(() => {
  const status = props.image?.validationStatus
  const url = props.image?.imageUrl
  if (!url || !isVaccineImageBrowseable(status)) {
    return null
  }
  return url
})

const showImage = computed(
  () => Boolean(browseableUrl.value) && !imageBroken.value,
)

const altText = computed(() =>
  t('vaccines.image.alt', { name: props.vaccineName }),
)

const showReviewBadge = computed(
  () =>
    props.showReviewIndicator &&
    String(props.image?.validationStatus ?? '') === 'REVIEW_REQUIRED' &&
    showImage.value,
)

watch(
  () => browseableUrl.value,
  () => {
    imageLoaded.value = false
    imageBroken.value = false
  },
)

async function handleImageError(): Promise<void> {
  if (!refetchAttempted.value && props.onUrlExpired) {
    refetchAttempted.value = true
    refetching.value = true
    try {
      await props.onUrlExpired()
    } finally {
      refetching.value = false
    }
    return
  }

  imageBroken.value = true
  imageLoaded.value = false
}

function handleImageLoad(): void {
  imageLoaded.value = true
  imageBroken.value = false
}
</script>

<template>
  <div
    class="relative aspect-square w-20 shrink-0 overflow-hidden rounded-md bg-elevated sm:w-24"
    data-testid="vaccine-image-thumbnail"
  >
    <img
      v-if="showImage && browseableUrl"
      :src="browseableUrl"
      :alt="altText"
      class="h-full w-full object-contain"
      loading="lazy"
      data-testid="vaccine-image-img"
      @load="handleImageLoad"
      @error="handleImageError"
    />

    <div
      v-if="!showImage || !imageLoaded || refetching"
      class="absolute inset-0 flex items-center justify-center bg-elevated"
      data-testid="vaccine-image-placeholder"
      role="img"
      :aria-label="
        refetching
          ? t('vaccines.image.loading')
          : t('vaccines.image.placeholder')
      "
    >
      <span v-if="refetching" class="sr-only">{{
        t('vaccines.image.loading')
      }}</span>
      <UIcon
        v-if="refetching"
        name="i-lucide-loader-circle"
        class="size-6 animate-spin text-muted"
        aria-hidden="true"
      />
      <UIcon
        v-else
        name="i-lucide-syringe"
        class="size-8 text-muted"
        aria-hidden="true"
      />
    </div>

    <UBadge
      v-if="showReviewBadge"
      color="warning"
      variant="subtle"
      size="sm"
      class="absolute bottom-1 left-1"
      data-testid="vaccine-image-review-indicator"
    >
      {{ t('vaccines.image.reviewIndicator') }}
    </UBadge>
  </div>
</template>
