<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { OrderHistoryRow } from '@/composables/useOrderHistory'
import { shortOrderId } from '@/composables/order-history-filters'
import {
  deliveryMethodLabel,
  formatDate,
  formatDateTime,
  orderStatusLabel,
  translatePlural,
} from '@/i18n'

const props = defineProps<{
  order: OrderHistoryRow
  showPharmacy: boolean
}>()

const { t } = useI18n()
const linesExpanded = ref(false)

const lineCount = computed(() => props.order.orderLines.length)

const linesSummary = computed(() =>
  t('orderHistory.lines.summary', {
    count: lineCount.value,
    doses: props.order.totalQuantity,
  }),
)

const pharmacyLabel = computed(() => {
  const pharmacy = props.order.pharmacy
  if (!pharmacy?.pharmacyName) {
    return t('orderHistory.value.unavailable')
  }
  return pharmacy.pharmacyName
})

const completedByLabel = computed(() => {
  if (props.order.completedByDisplayName) {
    return props.order.completedByDisplayName
  }
  return t('orderHistory.value.unavailable')
})

function displayOrUnavailable(value: string | null | undefined): string {
  if (value == null || value === '') {
    return t('orderHistory.value.unavailable')
  }
  return value
}

function toggleLines() {
  linesExpanded.value = !linesExpanded.value
}
</script>

<template>
  <article
    class="space-y-3 rounded-lg border border-default p-4 text-sm"
    data-testid="order-history-card"
  >
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="font-semibold" :title="order.id">
        {{ t('orderHistory.orderId.short', { id: shortOrderId(order.id) }) }}
      </h3>
      <UBadge variant="subtle" :aria-label="orderStatusLabel(order.status)">
        {{ orderStatusLabel(order.status) }}
      </UBadge>
    </div>

    <dl class="grid gap-2">
      <div v-if="showPharmacy">
        <dt class="font-medium">{{ t('orderHistory.field.pharmacy') }}</dt>
        <dd>{{ pharmacyLabel }}</dd>
      </div>
      <div>
        <dt class="font-medium">{{ t('orderHistory.field.submittedAt') }}</dt>
        <dd>{{ formatDateTime(order.submittedAt) }}</dd>
      </div>
      <div>
        <dt class="font-medium">{{ t('orderHistory.field.deliveryDate') }}</dt>
        <dd>{{ formatDate(order.deliveryDate) }}</dd>
      </div>
      <div>
        <dt class="font-medium">{{ t('orderHistory.field.deliveredAt') }}</dt>
        <dd>
          {{
            order.deliveredAt
              ? formatDateTime(order.deliveredAt)
              : t('orderHistory.value.unavailable')
          }}
        </dd>
      </div>
      <div v-if="order.cancelledAt">
        <dt class="font-medium">{{ t('orderHistory.field.cancelledAt') }}</dt>
        <dd>{{ formatDateTime(order.cancelledAt) }}</dd>
      </div>
      <div v-if="order.cancelledAt || order.cancellationReason">
        <dt class="font-medium">
          {{ t('orderHistory.field.cancellationReason') }}
        </dt>
        <dd>{{ displayOrUnavailable(order.cancellationReason) }}</dd>
      </div>
      <div>
        <dt class="font-medium">{{ t('orderHistory.field.totalQuantity') }}</dt>
        <dd>
          {{ translatePlural('admin.orders.totalDoses', order.totalQuantity) }}
        </dd>
      </div>
      <div>
        <dt class="font-medium">{{ t('orderHistory.field.completedBy') }}</dt>
        <dd>{{ completedByLabel }}</dd>
      </div>
      <div>
        <dt class="font-medium">
          {{ t('orderHistory.field.deliveryMethod') }}
        </dt>
        <dd>{{ deliveryMethodLabel(order.deliveryMethod) }}</dd>
      </div>
    </dl>

    <div>
      <button
        type="button"
        class="inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline"
        data-testid="order-history-lines-toggle"
        :aria-expanded="linesExpanded"
        :aria-controls="`order-history-lines-${order.id}`"
        @click="toggleLines"
      >
        <UIcon
          :name="
            linesExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
          "
          class="size-4"
          aria-hidden="true"
        />
        <span>{{
          linesExpanded
            ? t('orderHistory.lines.collapse')
            : t('orderHistory.lines.expand')
        }}</span>
        <span class="font-normal text-muted">— {{ linesSummary }}</span>
      </button>

      <ul
        v-if="linesExpanded"
        :id="`order-history-lines-${order.id}`"
        class="mt-2 space-y-1 border-l border-default pl-3"
        data-testid="order-history-lines"
      >
        <li
          v-for="line in order.orderLines"
          :key="`${line.vaccineId}-${line.vaccineName}`"
        >
          {{
            t('orderHistory.lines.detail', {
              name: line.vaccineName,
              manufacturer: line.manufacturer,
              quantity: line.quantity,
            })
          }}
        </li>
      </ul>
    </div>
  </article>
</template>
