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
