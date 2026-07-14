import gql from 'graphql-tag'

export const createOwnUserMutationSource = gql`
  mutation CreateOwnUser($input: CreateOwnUserInput!) {
    createOwnUser(input: $input) {
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

export const updateOwnUserMutationSource = gql`
  mutation UpdateOwnUser($input: UpdateOwnUserInput!) {
    updateOwnUser(input: $input) {
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
  CreateOwnUserMutation,
  CreateOwnUserMutationVariables,
  UpdateOwnUserMutation,
  UpdateOwnUserMutationVariables,
} from '@vaccin-delivery/types'
export {
  CreateOwnUserDocument as CREATE_OWN_USER_MUTATION,
  UpdateOwnUserDocument as UPDATE_OWN_USER_MUTATION,
} from '@vaccin-delivery/types'
