import gql from 'graphql-tag'

export const stockAdjustmentsQuerySource = gql`
  query StockAdjustments($vaccineId: ID) {
    stockAdjustments(vaccineId: $vaccineId) {
      id
      vaccineId
      type
      quantityDelta
      quantityBefore
      quantityAfter
      reason
      performedByUserId
      relatedOrderId
      createdAt
      performedByUser {
        id
        firstName
        lastName
        email
      }
    }
  }
`

export type {
  StockAdjustmentsQuery,
  StockAdjustmentsQueryVariables,
} from '@vaccin-delivery/types'
export { StockAdjustmentsDocument as STOCK_ADJUSTMENTS_QUERY } from '@vaccin-delivery/types'

export const vaccineStockHistoryQuerySource = gql`
  query VaccineStockHistory($vaccineId: ID!) {
    vaccineStockHistory(vaccineId: $vaccineId) {
      id
      vaccineId
      type
      quantityDelta
      quantityBefore
      quantityAfter
      reason
      performedByUserId
      relatedOrderId
      createdAt
      performedByUser {
        id
        firstName
        lastName
        email
      }
    }
  }
`

export type {
  VaccineStockHistoryQuery,
  VaccineStockHistoryQueryVariables,
} from '@vaccin-delivery/types'
export { VaccineStockHistoryDocument as VACCINE_STOCK_HISTORY_QUERY } from '@vaccin-delivery/types'
