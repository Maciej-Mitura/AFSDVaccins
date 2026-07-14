import gql from 'graphql-tag'

/** Operation source consumed by GraphQL Code Generator. */
export const currentFirebaseUserQuerySource = gql`
  query CurrentFirebaseUser {
    currentFirebaseUser {
      uid
      email
      displayName
      emailVerified
    }
  }
`

export type {
  CurrentFirebaseUserQuery,
  CurrentFirebaseUserQueryVariables,
} from '@vaccin-delivery/types'
export { CurrentFirebaseUserDocument as CURRENT_FIREBASE_USER_QUERY } from '@vaccin-delivery/types'
