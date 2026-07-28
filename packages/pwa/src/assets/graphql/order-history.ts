import gql from 'graphql-tag'

export const orderHistoryQuerySource = gql`
  query OrderHistory($input: OrderHistoryInput!) {
    orderHistory(input: $input) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        cursor
        node {
          id
          status
          orderLines {
            vaccineId
            vaccineName
            manufacturer
            quantity
          }
          totalQuantity
          submittedAt
          deliveryDate
          cancelledAt
          deliveredAt
          cancellationReason
          pharmacy {
            apothekerUserId
            pharmacyName
            address {
              street
              houseNumber
              postalCode
              city
              country
            }
          }
          completedByUserId
          completedByDisplayName
          deliveryMethod
        }
      }
    }
  }
`

export type {
  OrderHistoryQuery,
  OrderHistoryQueryVariables,
  OrderHistoryInput,
  OrderHistoryItem,
  OrderHistoryConnection,
  OrderHistoryEdge,
  OrderHistoryPharmacy,
} from '@vaccin-delivery/types'
export { OrderHistoryDocument as ORDER_HISTORY_QUERY } from '@vaccin-delivery/types'
