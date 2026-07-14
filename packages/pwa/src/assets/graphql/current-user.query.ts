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
    }
  }
`

export type {
  CurrentUserQuery,
  CurrentUserQueryVariables,
} from '@vaccin-delivery/types'
export { CurrentUserDocument as CURRENT_USER_QUERY } from '@vaccin-delivery/types'
