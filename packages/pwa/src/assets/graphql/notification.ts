import gql from 'graphql-tag'

export const myNotificationsQuerySource = gql`
  query MyNotifications($unreadOnly: Boolean = false) {
    myNotifications(unreadOnly: $unreadOnly) {
      id
      type
      title
      body
      titleKey
      bodyKey
      interpolationData {
        routeDate
        pharmacyName
        city
        orderReference
        orderCount
        stopCount
        doseCount
        warningPercentage
        weeklyDoseCap
        vaccineName
        quantityRemaining
        stockThreshold
      }
      read
      readAt
      relatedOrderId
      eventId
      actionPath
      createdAt
    }
  }
`

export type {
  MyNotificationsQuery,
  MyNotificationsQueryVariables,
} from '@vaccin-delivery/types'
export { MyNotificationsDocument as MY_NOTIFICATIONS_QUERY } from '@vaccin-delivery/types'

export const myUnreadNotificationCountQuerySource = gql`
  query MyUnreadNotificationCount {
    myUnreadNotificationCount
  }
`

export type { MyUnreadNotificationCountQuery } from '@vaccin-delivery/types'
export { MyUnreadNotificationCountDocument as MY_UNREAD_NOTIFICATION_COUNT_QUERY } from '@vaccin-delivery/types'

export const markNotificationReadMutationSource = gql`
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id) {
      id
      read
      readAt
    }
  }
`

export type {
  MarkNotificationReadMutation,
  MarkNotificationReadMutationVariables,
} from '@vaccin-delivery/types'
export { MarkNotificationReadDocument as MARK_NOTIFICATION_READ_MUTATION } from '@vaccin-delivery/types'

export const markAllNotificationsReadMutationSource = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`

export type { MarkAllNotificationsReadMutation } from '@vaccin-delivery/types'
export { MarkAllNotificationsReadDocument as MARK_ALL_NOTIFICATIONS_READ_MUTATION } from '@vaccin-delivery/types'

export const notificationReceivedSubscriptionSource = gql`
  subscription NotificationReceived {
    notificationReceived {
      id
      type
      title
      body
      titleKey
      bodyKey
      interpolationData {
        routeDate
        pharmacyName
        city
        orderReference
        orderCount
        stopCount
        doseCount
        warningPercentage
        weeklyDoseCap
        vaccineName
        quantityRemaining
        stockThreshold
      }
      read
      readAt
      relatedOrderId
      eventId
      actionPath
      createdAt
    }
  }
`

export type { NotificationReceivedSubscription } from '@vaccin-delivery/types'
export { NotificationReceivedDocument as NOTIFICATION_RECEIVED_SUBSCRIPTION } from '@vaccin-delivery/types'
