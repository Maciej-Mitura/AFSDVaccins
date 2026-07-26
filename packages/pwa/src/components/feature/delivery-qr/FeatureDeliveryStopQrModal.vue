<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import type { DeliveryStopQrModalContext } from '@/composables/useDeliveryStopQrDisplay'
import { formatDate, orderStatusLabel, routeStatusLabel } from '@/i18n'
import { translatePlural } from '@/i18n'

const props = defineProps<{
  open: boolean
  context: DeliveryStopQrModalContext | null
  objectUrl: string | null
  loading: boolean
  errorMessage: string | null
  inactiveMessage: string | null
  canDownload: boolean
  downloadFilename: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
  retry: []
  download: []
}>()

const { t } = useI18n()

const addressLine = computed(() => {
  const address = props.context?.address
  if (!address) {
    return ''
  }
  const street = [address.street, address.houseNumber]
    .filter(part => typeof part === 'string' && part.length > 0)
    .join(' ')
  return [street, address.postalCode, address.city]
    .filter(part => typeof part === 'string' && part.length > 0)
    .join(', ')
})

const orderCountLabel = computed(() => {
  if (!props.context) {
    return ''
  }
  return translatePlural('routes.stop.orders', props.context.orderCount)
})

function onOpenChange(value: boolean): void {
  emit('update:open', value)
  if (!value) {
    emit('close')
  }
}

function formatAddressBlock(): string {
  return addressLine.value
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('deliveryStopQr.modal.title')"
    data-testid="delivery-stop-qr-modal"
    @update:open="onOpenChange"
  >
    <template #body>
      <div
        v-if="context"
        class="max-h-[min(80vh,40rem)] space-y-4 overflow-y-auto overscroll-contain pr-1"
        data-testid="delivery-stop-qr-modal-body"
      >
        <UAlert
          color="info"
          variant="subtle"
          :title="t('deliveryStopQr.modal.showToCourier')"
          :description="t('deliveryStopQr.modal.scanDoesNotComplete')"
          data-testid="delivery-stop-qr-instructions"
        />

        <section aria-labelledby="delivery-stop-qr-destination-heading">
          <h3
            id="delivery-stop-qr-destination-heading"
            class="text-sm font-medium text-muted"
          >
            {{ t('deliveryStopQr.modal.destination') }}
          </h3>
          <p class="mt-1 font-medium" data-testid="delivery-stop-qr-pharmacy">
            {{ context.pharmacyName }}
          </p>
          <p class="text-sm" data-testid="delivery-stop-qr-address">
            {{ formatAddressBlock() }}
          </p>
        </section>

        <section aria-labelledby="delivery-stop-qr-route-heading">
          <h3
            id="delivery-stop-qr-route-heading"
            class="text-sm font-medium text-muted"
          >
            {{ t('deliveryStopQr.modal.route') }}
          </h3>
          <p class="mt-1 text-sm" data-testid="delivery-stop-qr-date">
            {{ t('bezorger.route.date', { date: formatDate(context.routeDate) }) }}
          </p>
          <p
            v-if="context.routeStatus"
            class="text-sm"
            data-testid="delivery-stop-qr-route-status"
          >
            {{ routeStatusLabel(context.routeStatus) }}
          </p>
          <p class="text-sm" data-testid="delivery-stop-qr-sequence">
            {{
              t('deliveryStopQr.modal.stopSequence', {
                sequence: context.stopSequence,
              })
            }}
          </p>
          <p class="text-sm">{{ orderCountLabel }}</p>
        </section>

        <section aria-labelledby="delivery-stop-qr-orders-heading">
          <h3
            id="delivery-stop-qr-orders-heading"
            class="text-sm font-medium text-muted"
          >
            {{ t('deliveryStopQr.modal.includedOrders') }}
          </h3>
          <ul
            class="mt-2 space-y-3"
            data-testid="delivery-stop-qr-orders"
          >
            <li
              v-for="order in context.orders"
              :key="order.orderId"
              class="rounded-md border border-default p-2 text-sm"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{
                  t('admin.orders.orderId', { id: order.orderId })
                }}</span>
                <UBadge variant="subtle">{{
                  orderStatusLabel(order.status)
                }}</UBadge>
              </div>
              <ul class="mt-1 space-y-0.5 text-muted">
                <li
                  v-for="line in order.lines"
                  :key="`${order.orderId}-${line.vaccineId}`"
                >
                  {{
                    t('admin.orders.line', {
                      name: line.vaccineName,
                      count: line.quantity,
                    })
                  }}
                </li>
              </ul>
            </li>
          </ul>
        </section>

        <div
          class="flex flex-col items-center gap-3"
          data-testid="delivery-stop-qr-image-region"
        >
          <CommonLoadingSkeleton
            v-if="loading"
            data-testid="delivery-stop-qr-loading"
          />

          <UAlert
            v-else-if="inactiveMessage"
            color="warning"
            variant="subtle"
            :title="inactiveMessage"
            data-testid="delivery-stop-qr-inactive"
          />

          <template v-else-if="errorMessage">
            <UAlert
              color="error"
              variant="subtle"
              :title="errorMessage"
              data-testid="delivery-stop-qr-error"
            />
            <UButton
              size="sm"
              variant="outline"
              data-testid="delivery-stop-qr-retry"
              @click="emit('retry')"
            >
              {{ t('deliveryStopQr.modal.retry') }}
            </UButton>
          </template>

          <img
            v-else-if="objectUrl"
            :src="objectUrl"
            :alt="t('deliveryStopQr.modal.imageAlt')"
            class="h-auto w-full max-w-[min(100%,20rem)] object-contain"
            data-testid="delivery-stop-qr-image"
          />
        </div>

        <UAlert
          v-if="canDownload"
          color="neutral"
          variant="subtle"
          :title="t('deliveryStopQr.modal.keepPrivate')"
          data-testid="delivery-stop-qr-privacy"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex flex-wrap justify-end gap-2">
        <UButton
          v-if="canDownload"
          color="primary"
          variant="soft"
          :aria-label="
            t('deliveryStopQr.modal.downloadAria', {
              filename: downloadFilename,
            })
          "
          data-testid="delivery-stop-qr-download"
          @click="emit('download')"
        >
          {{ t('deliveryStopQr.modal.download') }}
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          data-testid="delivery-stop-qr-close"
          @click="onOpenChange(false)"
        >
          {{ t('common.close') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
