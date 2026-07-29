<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type {
  DeliveryQrConfirmResult,
  DeliveryQrPreviewResult,
} from '@/api/delivery-qr-rest'
import type { DeliveryQrScanError } from '@/composables/delivery-qr/useDeliveryQrScanSession'
import { formatDateTime, orderStatusLabel, routeStatusLabel } from '@/i18n'
import { translatePlural } from '@/i18n'

const props = defineProps<{
  open: boolean
  preview: DeliveryQrPreviewResult | null
  confirmResult: DeliveryQrConfirmResult | null
  error: DeliveryQrScanError | null
  awaitingFinalConfirm: boolean
  confirming: boolean
  success: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  cancel: []
  'request-mark-delivered': []
  'cancel-final-confirm': []
  confirm: []
  'check-again': []
  acknowledge: []
  retry: []
}>()

const { t } = useI18n()

const title = computed(() => {
  if (props.success) {
    return t('bezorger.route.qr.success.title')
  }
  return t('bezorger.route.qr.preview.title')
})

const orderCountLabel = computed(() => {
  if (!props.preview) {
    return ''
  }
  return translatePlural('routes.stop.orders', props.preview.orderCount)
})

function close(): void {
  emit('update:open', false)
  emit('cancel')
}

function onOpenChange(value: boolean): void {
  if (!value) {
    if (props.success) {
      emit('acknowledge')
      return
    }
    close()
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    data-testid="delivery-qr-preview-modal"
    @update:open="onOpenChange"
  >
    <template #body>
      <div
        v-if="success && confirmResult"
        class="space-y-3"
        data-testid="delivery-qr-success"
      >
        <UAlert
          color="success"
          variant="subtle"
          :title="t('bezorger.route.qr.success.title')"
          :description="
            t('bezorger.route.qr.success.description', {
              count: confirmResult.orderCount,
              deliveredAt: formatDateTime(confirmResult.deliveredAt),
            })
          "
        />
      </div>

      <div
        v-else-if="preview"
        class="space-y-4"
        data-testid="delivery-qr-preview-body"
      >
        <UAlert
          color="info"
          variant="subtle"
          :title="t('bezorger.route.qr.preview.scanNotDelivered')"
          data-testid="delivery-qr-scan-not-delivered"
        />

        <section aria-labelledby="delivery-qr-route-heading">
          <h3
            id="delivery-qr-route-heading"
            class="text-sm font-medium text-muted"
          >
            {{ t('bezorger.route.qr.preview.route') }}
          </h3>
          <p class="mt-1 text-sm" data-testid="delivery-qr-route-date">
            {{ t('bezorger.route.date', { date: preview.routeDate }) }}
          </p>
          <p class="text-sm" data-testid="delivery-qr-route-status">
            {{ routeStatusLabel(preview.routeStatus) }}
          </p>
        </section>

        <section aria-labelledby="delivery-qr-destination-heading">
          <h3
            id="delivery-qr-destination-heading"
            class="text-sm font-medium text-muted"
          >
            {{ t('bezorger.route.qr.preview.destination') }}
          </h3>
          <p
            class="mt-1 text-base font-semibold"
            data-testid="delivery-qr-pharmacy-name"
          >
            {{ preview.pharmacy.name }}
          </p>
          <p class="text-sm" data-testid="delivery-qr-pharmacy-address">
            {{ preview.pharmacy.addressLine }}
          </p>
          <p class="text-sm" data-testid="delivery-qr-pharmacy-city">
            {{ preview.pharmacy.postalCode }} {{ preview.pharmacy.city }}
          </p>
          <p
            class="mt-1 text-xs text-muted"
            data-testid="delivery-qr-stop-sequence"
          >
            {{
              t('bezorger.route.stop.label', { sequence: preview.stopSequence })
            }}
          </p>
        </section>

        <section aria-labelledby="delivery-qr-orders-heading">
          <h3
            id="delivery-qr-orders-heading"
            class="text-sm font-medium text-muted"
          >
            {{ t('bezorger.route.qr.preview.orders') }}
            <span class="font-normal">({{ orderCountLabel }})</span>
          </h3>

          <ul class="mt-2 space-y-3" data-testid="delivery-qr-orders-list">
            <li
              v-for="order in preview.orders"
              :key="order.orderId"
              class="rounded-lg border border-default px-3 py-2"
              data-testid="delivery-qr-order"
            >
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p
                  class="text-sm font-medium"
                  data-testid="delivery-qr-order-ref"
                >
                  {{
                    t('bezorger.route.qr.preview.orderRef', {
                      reference: order.orderId,
                    })
                  }}
                </p>
                <p class="text-xs text-muted">
                  {{ orderStatusLabel(order.status) }}
                </p>
              </div>
              <table class="mt-2 w-full text-sm">
                <caption class="sr-only">
                  {{
                    t('bezorger.route.qr.preview.vaccineLines')
                  }}
                </caption>
                <thead>
                  <tr class="text-left text-xs text-muted">
                    <th scope="col">
                      {{ t('bezorger.route.qr.preview.vaccineName') }}
                    </th>
                    <th scope="col" class="text-right">
                      {{ t('bezorger.route.qr.preview.quantity') }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="line in order.lines"
                    :key="`${order.orderId}-${line.vaccineId}`"
                    data-testid="delivery-qr-order-line"
                  >
                    <td class="py-0.5 pr-2">{{ line.vaccineName }}</td>
                    <td class="py-0.5 text-right font-medium">
                      {{ line.quantity }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </li>
          </ul>
        </section>

        <section
          aria-labelledby="delivery-qr-summary-heading"
          class="rounded-lg bg-elevated/50 px-3 py-2"
          data-testid="delivery-qr-summary"
        >
          <h3
            id="delivery-qr-summary-heading"
            class="text-sm font-medium text-muted"
          >
            {{ t('bezorger.route.qr.preview.summary') }}
          </h3>
          <p class="mt-1 text-sm" data-testid="delivery-qr-total-lines">
            {{
              t('bezorger.route.qr.preview.totalLines', {
                count: preview.totalLineCount,
              })
            }}
          </p>
          <p
            class="text-sm font-medium"
            data-testid="delivery-qr-total-quantity"
          >
            {{
              t('bezorger.route.qr.preview.totalQuantity', {
                quantity: preview.totalItemQuantity,
              })
            }}
          </p>
        </section>

        <UAlert
          v-if="error?.confirmationInProgress"
          color="warning"
          variant="subtle"
          :title="t('bezorger.route.qr.confirm.inProgress')"
          :description="t('bezorger.route.qr.confirm.inProgressHint')"
          data-testid="delivery-qr-in-progress"
        />

        <UAlert
          v-else-if="error?.message"
          color="error"
          variant="subtle"
          :title="error.message"
          data-testid="delivery-qr-confirm-error"
        />

        <UAlert
          v-if="awaitingFinalConfirm"
          color="warning"
          variant="subtle"
          :title="t('bezorger.route.qr.confirm.title')"
          :description="t('bezorger.route.qr.confirm.description')"
          data-testid="delivery-qr-final-confirm"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
        <template v-if="success">
          <UButton
            block
            class="min-h-12 sm:w-auto"
            data-testid="delivery-qr-success-ack"
            @click="emit('acknowledge')"
          >
            {{ t('common.close') }}
          </UButton>
        </template>

        <template v-else-if="preview">
          <UButton
            v-if="error?.confirmationInProgress"
            block
            class="min-h-12 sm:w-auto"
            data-testid="delivery-qr-check-again"
            :loading="confirming"
            :disabled="confirming"
            @click="emit('check-again')"
          >
            {{ t('bezorger.route.qr.confirm.checkAgain') }}
          </UButton>

          <UButton
            v-else-if="
              error && !error.blockConfirmRetry && !error.closeConfirmation
            "
            block
            class="min-h-12 sm:w-auto"
            data-testid="delivery-qr-confirm-retry"
            :loading="confirming"
            :disabled="confirming"
            @click="emit('retry')"
          >
            {{ t('common.retry') }}
          </UButton>

          <UButton
            v-if="!awaitingFinalConfirm && !error?.closeConfirmation"
            block
            class="min-h-12 sm:w-auto"
            color="primary"
            data-testid="delivery-qr-mark-delivered"
            :disabled="
              confirming ||
              !preview.canConfirmDelivery ||
              error?.blockConfirmRetry === true ||
              error?.confirmationInProgress === true
            "
            :loading="confirming"
            @click="emit('request-mark-delivered')"
          >
            {{
              confirming
                ? t('bezorger.route.qr.confirm.submitting')
                : t('bezorger.route.qr.confirm.markDelivered')
            }}
          </UButton>

          <UButton
            v-if="awaitingFinalConfirm"
            block
            class="min-h-12 sm:w-auto"
            color="primary"
            data-testid="delivery-qr-confirm-delivery"
            :loading="confirming"
            :disabled="confirming"
            @click="emit('confirm')"
          >
            {{
              confirming
                ? t('bezorger.route.qr.confirm.submitting')
                : t('bezorger.route.qr.confirm.confirmAction')
            }}
          </UButton>

          <UButton
            v-if="awaitingFinalConfirm"
            block
            class="min-h-12 sm:w-auto"
            variant="ghost"
            data-testid="delivery-qr-cancel-final"
            :disabled="confirming"
            @click="emit('cancel-final-confirm')"
          >
            {{ t('common.cancel') }}
          </UButton>

          <UButton
            v-else
            block
            class="min-h-12 sm:w-auto"
            variant="ghost"
            data-testid="delivery-qr-preview-close"
            :disabled="confirming"
            @click="close"
          >
            {{ t('common.cancel') }}
          </UButton>
        </template>
      </div>
    </template>
  </UModal>
</template>
