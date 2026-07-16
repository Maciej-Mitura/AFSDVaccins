import gql from 'graphql-tag'

export const deliveryRoutesQuerySource = gql`
  query DeliveryRoutes($deliveryDate: String, $bezorgerProfileId: ID) {
    deliveryRoutes(
      deliveryDate: $deliveryDate
      bezorgerProfileId: $bezorgerProfileId
    ) {
      id
      routeTemplateId
      bezorgerProfileId
      deliveryDate
      status
      stops {
        sequence
        apothekerProfileId
        apothekerUserId
        pharmacyName
        address {
          street
          houseNumber
          postalCode
          city
          country
        }
        orderIds
        orderCount
        totalQuantity
        lines {
          vaccineId
          vaccineName
          manufacturer
          quantity
        }
      }
      skippedApothekerProfileIds
      generatedAt
      generatedByUserId
      createdAt
      updatedAt
    }
  }
`

export type {
  DeliveryRoutesQuery,
  DeliveryRoutesQueryVariables,
} from '@vaccin-delivery/types'
export { DeliveryRoutesDocument as DELIVERY_ROUTES_QUERY } from '@vaccin-delivery/types'

export const deliveryRouteQuerySource = gql`
  query DeliveryRoute($id: ID!) {
    deliveryRoute(id: $id) {
      id
      routeTemplateId
      bezorgerProfileId
      deliveryDate
      status
      stops {
        sequence
        apothekerProfileId
        apothekerUserId
        pharmacyName
        address {
          street
          houseNumber
          postalCode
          city
          country
        }
        orderIds
        orderCount
        totalQuantity
        lines {
          vaccineId
          vaccineName
          manufacturer
          quantity
        }
      }
      skippedApothekerProfileIds
      generatedAt
      generatedByUserId
      createdAt
      updatedAt
    }
  }
`

export type {
  DeliveryRouteQuery,
  DeliveryRouteQueryVariables,
} from '@vaccin-delivery/types'
export { DeliveryRouteDocument as DELIVERY_ROUTE_QUERY } from '@vaccin-delivery/types'

export const myTodayRouteQuerySource = gql`
  query MyTodayRoute {
    myTodayRoute {
      id
      routeTemplateId
      bezorgerProfileId
      deliveryDate
      status
      stops {
        sequence
        apothekerProfileId
        apothekerUserId
        pharmacyName
        address {
          street
          houseNumber
          postalCode
          city
          country
        }
        orderIds
        orderCount
        totalQuantity
        lines {
          vaccineId
          vaccineName
          manufacturer
          quantity
        }
      }
      skippedApothekerProfileIds
      generatedAt
      generatedByUserId
      createdAt
      updatedAt
    }
  }
`

export type { MyTodayRouteQuery } from '@vaccin-delivery/types'
export { MyTodayRouteDocument as MY_TODAY_ROUTE_QUERY } from '@vaccin-delivery/types'

export const generateDeliveryRouteMutationSource = gql`
  mutation GenerateDeliveryRoute(
    $routeTemplateId: ID!
    $deliveryDate: String!
  ) {
    generateDeliveryRoute(
      routeTemplateId: $routeTemplateId
      deliveryDate: $deliveryDate
    ) {
      id
      routeTemplateId
      bezorgerProfileId
      deliveryDate
      status
      stops {
        sequence
        apothekerProfileId
        apothekerUserId
        pharmacyName
        address {
          street
          houseNumber
          postalCode
          city
          country
        }
        orderIds
        orderCount
        totalQuantity
        lines {
          vaccineId
          vaccineName
          manufacturer
          quantity
        }
      }
      skippedApothekerProfileIds
      generatedAt
      generatedByUserId
      createdAt
      updatedAt
    }
  }
`

export type {
  GenerateDeliveryRouteMutation,
  GenerateDeliveryRouteMutationVariables,
} from '@vaccin-delivery/types'
export {
  GenerateDeliveryRouteDocument as GENERATE_DELIVERY_ROUTE_MUTATION,
} from '@vaccin-delivery/types'

export const bezorgerRouteUpdatesSubscriptionSource = gql`
  subscription BezorgerRouteUpdates {
    bezorgerRouteUpdates {
      id
      routeTemplateId
      bezorgerProfileId
      deliveryDate
      status
      stops {
        sequence
        apothekerProfileId
        apothekerUserId
        pharmacyName
        address {
          street
          houseNumber
          postalCode
          city
          country
        }
        orderIds
        orderCount
        totalQuantity
        lines {
          vaccineId
          vaccineName
          manufacturer
          quantity
        }
      }
      skippedApothekerProfileIds
      generatedAt
      generatedByUserId
      createdAt
      updatedAt
    }
  }
`

export type { BezorgerRouteUpdatesSubscription } from '@vaccin-delivery/types'
export {
  BezorgerRouteUpdatesDocument as BEZORGER_ROUTE_UPDATES_SUBSCRIPTION,
} from '@vaccin-delivery/types'
