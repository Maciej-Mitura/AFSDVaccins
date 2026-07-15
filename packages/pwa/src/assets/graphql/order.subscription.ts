import gql from 'graphql-tag'

export const orderCreatedSubscriptionSource = gql`
  subscription OrderCreated {
    orderCreated {
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
        changedByUserId
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

export const orderUpdatedSubscriptionSource = gql`
  subscription OrderUpdated {
    orderUpdated {
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
        changedByUserId
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
  OrderCreatedSubscription,
  OrderUpdatedSubscription,
} from '@vaccin-delivery/types'
export {
  OrderCreatedDocument as ORDER_CREATED_SUBSCRIPTION,
  OrderUpdatedDocument as ORDER_UPDATED_SUBSCRIPTION,
} from '@vaccin-delivery/types'

export const adminOrderCreatedSubscriptionSource = gql`
  subscription AdminOrderCreated {
    orderCreated {
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

export const adminOrderUpdatedSubscriptionSource = gql`
  subscription AdminOrderUpdated {
    orderUpdated {
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
  AdminOrderCreatedSubscription,
  AdminOrderUpdatedSubscription,
} from '@vaccin-delivery/types'
export {
  AdminOrderCreatedDocument as ADMIN_ORDER_CREATED_SUBSCRIPTION,
  AdminOrderUpdatedDocument as ADMIN_ORDER_UPDATED_SUBSCRIPTION,
} from '@vaccin-delivery/types'

export const adminOperationsFeedSubscriptionSource = gql`
  subscription AdminOperationsFeed {
    adminOperationsFeed {
      eventType
      occurredAt
      message
      order {
        id
        status
        totalQuantity
        deliveryDate
      }
      vaccine {
        id
        name
        stockQuantity
        stockWarningThreshold
      }
    }
  }
`

export type { AdminOperationsFeedSubscription } from '@vaccin-delivery/types'
export {
  AdminOperationsFeedDocument as ADMIN_OPERATIONS_FEED_SUBSCRIPTION,
} from '@vaccin-delivery/types'
