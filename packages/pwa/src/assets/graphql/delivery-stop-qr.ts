import gql from 'graphql-tag'

export const deliveryStopQrQuerySource = gql`
  query DeliveryStopQr($routeId: ID!, $stopId: ID!) {
    deliveryStopQr(routeId: $routeId, stopId: $stopId) {
      routeId
      stopId
      routeDate
      pharmacyName
      address {
        street
        houseNumber
        postalCode
        city
        country
      }
      orderCount
      orderIds
      qrAvailable
      qrConsumed
      issuedAt
      qrImagePath
    }
  }
`

export type {
  DeliveryStopQrQuery,
  DeliveryStopQrQueryVariables,
} from '@vaccin-delivery/types'
export { DeliveryStopQrDocument as DELIVERY_STOP_QR_QUERY } from '@vaccin-delivery/types'

export const myPlannedDeliveriesQuerySource = gql`
  query MyPlannedDeliveries {
    myPlannedDeliveries {
      routeId
      stopId
      routeDate
      routeStatus
      stopSequence
      pharmacyName
      address {
        street
        houseNumber
        postalCode
        city
        country
      }
      orderCount
      orderIds
      orders {
        orderId
        status
        lines {
          vaccineId
          vaccineName
          quantity
        }
      }
      totalLineCount
      totalQuantity
      qrAvailable
      qrConsumed
      deliveredAt
      qrImagePath
      isNextStop
      lastKnownCourierCity
      lastKnownLocationRecordedAt
      courierLocationSource
    }
  }
`

export type {
  MyPlannedDeliveriesQuery,
  MyPlannedDeliveriesQueryVariables,
} from '@vaccin-delivery/types'
export { MyPlannedDeliveriesDocument as MY_PLANNED_DELIVERIES_QUERY } from '@vaccin-delivery/types'
