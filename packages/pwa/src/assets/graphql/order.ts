import gql from 'graphql-tag'

export const createOrderMutationSource = gql`
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      id
      status
      totalQuantity
      isoWeek
      isoYear
      submittedAt
      deliveryDate
      statusHistory {
        fromStatus
        toStatus
        changedAt
        reason
      }
      orderLines {
        vaccineId
        vaccineName
        manufacturer
        quantity
      }
    }
  }
`

export type {
  CreateOrderMutation,
  CreateOrderMutationVariables,
} from '@vaccin-delivery/types'
export { CreateOrderDocument as CREATE_ORDER_MUTATION } from '@vaccin-delivery/types'

export const myOrdersQuerySource = gql`
  query MyOrders($isoYear: Int, $isoWeek: Int) {
    myOrders(isoYear: $isoYear, isoWeek: $isoWeek) {
      id
      status
      totalQuantity
      isoWeek
      isoYear
      submittedAt
      deliveryDate
      cancelledAt
      stockDecrementedAt
      statusHistory {
        fromStatus
        toStatus
        changedAt
        reason
      }
      orderLines {
        vaccineId
        vaccineName
        manufacturer
        quantity
      }
    }
  }
`

export type {
  MyOrdersQuery,
  MyOrdersQueryVariables,
} from '@vaccin-delivery/types'
export { MyOrdersDocument as MY_ORDERS_QUERY } from '@vaccin-delivery/types'

export const myOrderQuerySource = gql`
  query MyOrder($id: ID!) {
    myOrder(id: $id) {
      id
      status
      totalQuantity
      isoWeek
      isoYear
      submittedAt
      deliveryDate
      cancelledAt
      stockDecrementedAt
      statusHistory {
        fromStatus
        toStatus
        changedAt
        reason
      }
      orderLines {
        vaccineId
        vaccineName
        manufacturer
        quantity
      }
    }
  }
`

export type {
  MyOrderQuery,
  MyOrderQueryVariables,
} from '@vaccin-delivery/types'
export { MyOrderDocument as MY_ORDER_QUERY } from '@vaccin-delivery/types'

export const myWeeklyOrderSummaryQuerySource = gql`
  query MyWeeklyOrderSummary($isoYear: Int, $isoWeek: Int) {
    myWeeklyOrderSummary(isoYear: $isoYear, isoWeek: $isoWeek) {
      isoYear
      isoWeek
      orderedQuantity
      weeklyLimit
      percentageUsed
      warningReached
      remainingQuantity
    }
  }
`

export type {
  MyWeeklyOrderSummaryQuery,
  MyWeeklyOrderSummaryQueryVariables,
} from '@vaccin-delivery/types'
export { MyWeeklyOrderSummaryDocument as MY_WEEKLY_ORDER_SUMMARY_QUERY } from '@vaccin-delivery/types'

export const myDailyVaccineAllowancesQuerySource = gql`
  query MyDailyVaccineAllowances {
    myDailyVaccineAllowances {
      deliveryDate
      allowances {
        vaccineId
        vaccineName
        dailyMaximum
        orderedToday
        remainingToday
      }
    }
  }
`

export type {
  MyDailyVaccineAllowancesQuery,
  MyDailyVaccineAllowancesQueryVariables,
} from '@vaccin-delivery/types'
export {
  MyDailyVaccineAllowancesDocument as MY_DAILY_VACCINE_ALLOWANCES_QUERY,
} from '@vaccin-delivery/types'

export const cancelOwnOrderMutationSource = gql`
  mutation CancelOwnOrder($id: ID!) {
    cancelOwnOrder(id: $id) {
      id
      status
      cancelledAt
    }
  }
`

export type {
  CancelOwnOrderMutation,
  CancelOwnOrderMutationVariables,
} from '@vaccin-delivery/types'
export { CancelOwnOrderDocument as CANCEL_OWN_ORDER_MUTATION } from '@vaccin-delivery/types'

export const ordersQuerySource = gql`
  query Orders(
    $isoYear: Int
    $isoWeek: Int
    $status: OrderStatus
    $apothekerId: ID
  ) {
    orders(
      isoYear: $isoYear
      isoWeek: $isoWeek
      status: $status
      apothekerId: $apothekerId
    ) {
      id
      status
      totalQuantity
      isoWeek
      isoYear
      submittedAt
      deliveryDate
      apotheker {
        id
        firstName
        lastName
        email
      }
      orderLines {
        vaccineId
        vaccineName
        manufacturer
        quantity
      }
    }
  }
`

export type {
  OrdersQuery,
  OrdersQueryVariables,
} from '@vaccin-delivery/types'
export { OrdersDocument as ORDERS_QUERY } from '@vaccin-delivery/types'

export const orderQuerySource = gql`
  query Order($id: ID!) {
    order(id: $id) {
      id
      status
      totalQuantity
      isoWeek
      isoYear
      submittedAt
      deliveryDate
      apotheker {
        id
        firstName
        lastName
        email
      }
      orderLines {
        vaccineId
        vaccineName
        manufacturer
        quantity
      }
    }
  }
`

export type {
  OrderQuery,
  OrderQueryVariables,
} from '@vaccin-delivery/types'
export { OrderDocument as ORDER_QUERY } from '@vaccin-delivery/types'

export const adminOrdersQuerySource = gql`
  query AdminOrders(
    $deliveryDate: String
    $isoYear: Int
    $isoWeek: Int
    $status: OrderStatus
    $apothekerId: ID
  ) {
    adminOrders(
      deliveryDate: $deliveryDate
      isoYear: $isoYear
      isoWeek: $isoWeek
      status: $status
      apothekerId: $apothekerId
    ) {
      id
      status
      totalQuantity
      isoWeek
      isoYear
      submittedAt
      deliveryDate
      stockDecrementedAt
      statusHistory {
        fromStatus
        toStatus
        changedAt
        changedByUserId
        reason
      }
      apotheker {
        id
        firstName
        lastName
        email
      }
      orderLines {
        vaccineId
        vaccineName
        manufacturer
        quantity
      }
    }
  }
`

export type {
  AdminOrdersQuery,
  AdminOrdersQueryVariables,
} from '@vaccin-delivery/types'
export { AdminOrdersDocument as ADMIN_ORDERS_QUERY } from '@vaccin-delivery/types'

export const adminDailyOrderOverviewQuerySource = gql`
  query AdminDailyOrderOverview($deliveryDate: String!) {
    adminDailyOrderOverview(deliveryDate: $deliveryDate) {
      deliveryDate
      totalOrders
      totalDoses
      cancelledOrderCount
      cancelledDoseCount
      statusCounts {
        status
        count
      }
      pharmacistSummaries {
        apothekerId
        orderCount
        totalDoses
      }
      vaccineQuantities {
        vaccineId
        vaccineName
        quantity
      }
    }
  }
`

export type {
  AdminDailyOrderOverviewQuery,
  AdminDailyOrderOverviewQueryVariables,
} from '@vaccin-delivery/types'
export {
  AdminDailyOrderOverviewDocument as ADMIN_DAILY_ORDER_OVERVIEW_QUERY,
} from '@vaccin-delivery/types'

export const adminWeeklyStatisticsQuerySource = gql`
  query AdminWeeklyStatistics($isoYear: Int!, $isoWeek: Int!) {
    adminWeeklyStatistics(isoYear: $isoYear, isoWeek: $isoWeek) {
      isoYear
      isoWeek
      totalOrders
      totalDoses
      cancelledOrderCount
      cancelledDoseCount
      statusCounts {
        status
        count
      }
      vaccineQuantities {
        vaccineId
        vaccineName
        quantity
      }
    }
  }
`

export type {
  AdminWeeklyStatisticsQuery,
  AdminWeeklyStatisticsQueryVariables,
} from '@vaccin-delivery/types'
export {
  AdminWeeklyStatisticsDocument as ADMIN_WEEKLY_STATISTICS_QUERY,
} from '@vaccin-delivery/types'

export const updateOrderStatusMutationSource = gql`
  mutation UpdateOrderStatus($id: ID!, $status: OrderStatus!, $reason: String) {
    updateOrderStatus(id: $id, status: $status, reason: $reason) {
      id
      status
      stockDecrementedAt
      statusHistory {
        fromStatus
        toStatus
        changedAt
        changedByUserId
        reason
      }
    }
  }
`

export type {
  UpdateOrderStatusMutation,
  UpdateOrderStatusMutationVariables,
} from '@vaccin-delivery/types'
export {
  UpdateOrderStatusDocument as UPDATE_ORDER_STATUS_MUTATION,
} from '@vaccin-delivery/types'

export const cancelOrderMutationSource = gql`
  mutation CancelOrder($id: ID!, $reason: String) {
    cancelOrder(id: $id, reason: $reason) {
      id
      status
      cancelledAt
      statusHistory {
        fromStatus
        toStatus
        changedAt
        changedByUserId
        reason
      }
    }
  }
`

export type {
  CancelOrderMutation,
  CancelOrderMutationVariables,
} from '@vaccin-delivery/types'
export { CancelOrderDocument as CANCEL_ORDER_MUTATION } from '@vaccin-delivery/types'
