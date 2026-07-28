<script setup lang="ts">
import { ref } from 'vue'
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

defineProps<{
  orders: OrderHistoryRow[]
  showPharmacy: boolean
}>()

const { t } = useI18n()
const expandedIds = ref<Set<string>>(new Set())

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id)
}

function toggleLines(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedIds.value = next
}

function pharmacyLabel(order: OrderHistoryRow): string {
  return order.pharmacy?.pharmacyName ?? t('orderHistory.value.unavailable')
}

function completedByLabel(order: OrderHistoryRow): string {
  return order.completedByDisplayName ?? t('orderHistory.value.unavailable')
}

function displayOrUnavailable(value: string | null | undefined): string {
  if (value == null || value === '') {
    return t('orderHistory.value.unavailable')
  }
  return value
}
</script>

<template>
  <div class="overflow-x-auto" data-testid="order-history-table">
    <table class="min-w-full border-collapse text-left text-sm">
      <thead>
        <tr class="border-b border-default">
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.orderId') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.status') }}
          </th>
          <th v-if="showPharmacy" scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.pharmacy') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.lines') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.totalQuantity') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.submittedAt') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.deliveryDate') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.deliveredAt') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.cancelledAt') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.cancellationReason') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.completedBy') }}
          </th>
          <th scope="col" class="px-3 py-2 font-medium">
            {{ t('orderHistory.column.deliveryMethod') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="order in orders" :key="order.id">
          <tr
            class="border-b border-default align-top"
            data-testid="order-history-row"
          >
            <td class="px-3 py-2">
              <span :title="order.id">
                {{ shortOrderId(order.id) }}
              </span>
            </td>
            <td class="px-3 py-2">
              <UBadge
                variant="subtle"
                :aria-label="orderStatusLabel(order.status)"
              >
                {{ orderStatusLabel(order.status) }}
              </UBadge>
            </td>
            <td v-if="showPharmacy" class="px-3 py-2">
              {{ pharmacyLabel(order) }}
            </td>
            <td class="px-3 py-2">
              <button
                type="button"
                class="inline-flex items-center gap-1 text-left font-medium underline-offset-2 hover:underline"
                data-testid="order-history-lines-toggle"
                :aria-expanded="isExpanded(order.id)"
                :aria-controls="`order-history-table-lines-${order.id}`"
                @click="toggleLines(order.id)"
              >
                <UIcon
                  :name="
                    isExpanded(order.id)
                      ? 'i-lucide-chevron-down'
                      : 'i-lucide-chevron-right'
                  "
                  class="size-4 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  {{
                    t('orderHistory.lines.summary', {
                      count: order.orderLines.length,
                      doses: order.totalQuantity,
                    })
                  }}
                </span>
              </button>
            </td>
            <td class="px-3 py-2">
              {{
                translatePlural('admin.orders.totalDoses', order.totalQuantity)
              }}
            </td>
            <td class="px-3 py-2">
              <span :aria-label="t('orderHistory.field.submittedAt')">
                {{ formatDateTime(order.submittedAt) }}
              </span>
            </td>
            <td class="px-3 py-2">
              <span :aria-label="t('orderHistory.field.deliveryDate')">
                {{ formatDate(order.deliveryDate) }}
              </span>
            </td>
            <td class="px-3 py-2">
              <span :aria-label="t('orderHistory.field.deliveredAt')">
                {{
                  order.deliveredAt
                    ? formatDateTime(order.deliveredAt)
                    : t('orderHistory.value.unavailable')
                }}
              </span>
            </td>
            <td class="px-3 py-2">
              <span :aria-label="t('orderHistory.field.cancelledAt')">
                {{
                  order.cancelledAt
                    ? formatDateTime(order.cancelledAt)
                    : t('orderHistory.value.unavailable')
                }}
              </span>
            </td>
            <td class="px-3 py-2">
              {{ displayOrUnavailable(order.cancellationReason) }}
            </td>
            <td class="px-3 py-2">{{ completedByLabel(order) }}</td>
            <td class="px-3 py-2">
              {{ deliveryMethodLabel(order.deliveryMethod) }}
            </td>
          </tr>
          <tr v-if="isExpanded(order.id)">
            <td :colspan="showPharmacy ? 12 : 11" class="bg-muted/30 px-3 py-2">
              <ul
                :id="`order-history-table-lines-${order.id}`"
                class="space-y-1"
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
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
