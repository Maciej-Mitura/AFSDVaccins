import gql from 'graphql-tag'

export const adjustVaccineStockMutationSource = gql`
  mutation AdjustVaccineStock($input: AdjustStockInput!) {
    adjustVaccineStock(input: $input) {
      id
      vaccineId
      type
      quantityDelta
      quantityBefore
      quantityAfter
      reason
      performedByUserId
      createdAt
    }
  }
`

export type {
  AdjustVaccineStockMutation,
  AdjustVaccineStockMutationVariables,
} from '@vaccin-delivery/types'
export { AdjustVaccineStockDocument as ADJUST_VACCINE_STOCK_MUTATION } from '@vaccin-delivery/types'
