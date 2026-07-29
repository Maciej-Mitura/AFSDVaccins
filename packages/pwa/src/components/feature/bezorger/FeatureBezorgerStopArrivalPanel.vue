<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { StopArrivalViewModel } from '@/composables/useCourierStopArrival'
import { formatDateTime } from '@/i18n'
import { mapDeliveryArrivalErrorCode } from '@/api/delivery-arrival-errors'

defineProps<{
  viewModel: StopArrivalViewModel
  confirmCancel: boolean
}>()

const emit = defineEmits<{
  'mark-arrived': []
  'cancel-pending': []
  'dismiss-cancel': []
  retry: []
  discard: []
}>()

const { t } = useI18n()

function arrivalErrorLabel(code: string | null): string {
  if (!code) {
    return t('arrival.unableToRecord')
  }
  return mapDeliveryArrivalErrorCode(code)
}
</script>

<template>
  <div class="space-y-2" data-testid="route-stop-arrival">
    <p
      v-if="viewModel.state === 'confirmed'"
      class="text-sm font-medium text-highlighted"
      data-testid="route-stop-arrived"
      role="status"
    >
      {{
        t('arrival.arrivedAt', {
          time: formatDateTime(
            viewModel.clientArrivedAt ?? viewModel.recordedAt ?? '',
          ),
        })
      }}
    </p>
    <p
      v-if="viewModel.state === 'confirmed'"
      class="text-sm text-toned"
      data-testid="route-stop-arrived-not-delivered"
    >
      {{ t('arrival.notDeliveredYet') }}
    </p>

    <p
      v-else-if="viewModel.state === 'syncing'"
      class="text-sm text-highlighted"
      role="status"
      aria-live="polite"
      data-testid="route-stop-arrival-syncing"
    >
      {{ t('arrival.synchronising') }}
      <span class="text-muted">
        ({{ formatDateTime(viewModel.clientArrivedAt ?? '') }})
      </span>
    </p>

    <template v-else-if="viewModel.state === 'pending'">
      <p
        class="text-sm font-medium text-warning"
        role="status"
        data-testid="route-stop-arrival-pending"
      >
        {{ t('arrival.pending') }}
        <span class="font-normal text-muted">
          ({{ formatDateTime(viewModel.clientArrivedAt ?? '') }})
        </span>
      </p>
      <p class="text-xs text-muted">
        {{ t('arrival.willSyncWhenOnline') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="viewModel.canCancelPending"
          size="sm"
          class="min-h-11"
          variant="ghost"
          data-testid="route-stop-arrival-cancel"
          @click="emit('cancel-pending')"
        >
          {{
            confirmCancel
              ? t('arrival.cancelPendingConfirm')
              : t('arrival.cancelPending')
          }}
        </UButton>
        <UButton
          v-if="confirmCancel"
          size="sm"
          class="min-h-11"
          variant="ghost"
          @click="emit('dismiss-cancel')"
        >
          {{ t('common.cancel') }}
        </UButton>
      </div>
    </template>

    <template
      v-else-if="viewModel.state === 'failed' || viewModel.state === 'conflict'"
    >
      <p
        class="text-sm font-medium text-error"
        role="alert"
        data-testid="route-stop-arrival-error"
      >
        {{
          viewModel.state === 'conflict'
            ? t('arrival.conflict')
            : arrivalErrorLabel(viewModel.errorCode)
        }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="viewModel.canRetry"
          size="sm"
          class="min-h-11"
          variant="soft"
          color="primary"
          data-testid="route-stop-arrival-retry"
          @click="emit('retry')"
        >
          {{ t('arrival.retrySync') }}
        </UButton>
        <UButton
          v-if="viewModel.canDiscard"
          size="sm"
          class="min-h-11"
          variant="ghost"
          data-testid="route-stop-arrival-discard"
          @click="emit('discard')"
        >
          {{ t('arrival.discardPending') }}
        </UButton>
      </div>
    </template>

    <UButton
      v-else-if="viewModel.canMarkArrived"
      size="lg"
      block
      class="min-h-12 text-base"
      color="primary"
      data-testid="route-stop-mark-arrived"
      :aria-label="t('arrival.markArrived')"
      @click="emit('mark-arrived')"
    >
      {{ t('arrival.markArrived') }}
    </UButton>
  </div>
</template>
