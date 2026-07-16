import gql from 'graphql-tag'

export const currentUserQuerySource = gql`
  query CurrentUser {
    currentUser {
      id
      email
      firstName
      lastName
      role
      createdAt
      updatedAt
      apothekerProfile {
        id
        userId
        pharmacyName
        address {
          street
          houseNumber
          postalCode
          city
          country
        }
      }
      bezorgerProfile {
        id
        userId
        displayName
        vehicleLabel
      }
    }
  }
`

export type {
  CurrentUserQuery,
  CurrentUserQueryVariables,
} from '@vaccin-delivery/types'
export { CurrentUserDocument as CURRENT_USER_QUERY } from '@vaccin-delivery/types'
