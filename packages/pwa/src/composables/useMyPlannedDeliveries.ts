import { computed, ref } from 'vue'

import {
  MY_PLANNED_DELIVERIES_QUERY,
  type MyPlannedDeliveriesQuery,
} from '@/assets/graphql/delivery-stop-qr'
import useGraphQL from '@/composables/useGraphQL'
import { mapGraphQLError } from '@/composables/useCurrentUser'

export type PlannedDeliveryItem =
  MyPlannedDeliveriesQuery['myPlannedDeliveries'][number]

const plannedDeliveries = ref<PlannedDeliveryItem[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)

/**
 * Pharmacist stop-grouped planned deliveries (routeId + stopId from server).
 */
export function useMyPlannedDeliveries() {
  const { apolloClient } = useGraphQL()

  async function loadMyPlannedDeliveries(): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<MyPlannedDeliveriesQuery>({
        query: MY_PLANNED_DELIVERIES_QUERY,
        fetchPolicy: 'network-only',
      })
      plannedDeliveries.value = result.data.myPlannedDeliveries ?? []
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
    } finally {
      loading.value = false
    }
  }

  const hasPlannedDeliveries = computed(
    () => plannedDeliveries.value.length > 0,
  )

  return {
    plannedDeliveries,
    loading,
    errorMessage,
    hasPlannedDeliveries,
    loadMyPlannedDeliveries,
  }
}
