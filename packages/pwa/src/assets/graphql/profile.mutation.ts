import gql from 'graphql-tag'

export const completeApothekerProfileMutationSource = gql`
  mutation CompleteApothekerProfile($input: CompleteApothekerProfileInput!) {
    completeApothekerProfile(input: $input) {
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
      createdAt
      updatedAt
    }
  }
`

export const updateOwnApothekerProfileMutationSource = gql`
  mutation UpdateOwnApothekerProfile($input: UpdateOwnApothekerProfileInput!) {
    updateOwnApothekerProfile(input: $input) {
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
      createdAt
      updatedAt
    }
  }
`

export const completeBezorgerProfileMutationSource = gql`
  mutation CompleteBezorgerProfile($input: CompleteBezorgerProfileInput!) {
    completeBezorgerProfile(input: $input) {
      id
      userId
      displayName
      vehicleLabel
      createdAt
      updatedAt
    }
  }
`

export const updateOwnBezorgerProfileMutationSource = gql`
  mutation UpdateOwnBezorgerProfile($input: UpdateOwnBezorgerProfileInput!) {
    updateOwnBezorgerProfile(input: $input) {
      id
      userId
      displayName
      vehicleLabel
      createdAt
      updatedAt
    }
  }
`

export type {
  CompleteApothekerProfileMutation,
  CompleteApothekerProfileMutationVariables,
  UpdateOwnApothekerProfileMutation,
  UpdateOwnApothekerProfileMutationVariables,
  CompleteBezorgerProfileMutation,
  CompleteBezorgerProfileMutationVariables,
  UpdateOwnBezorgerProfileMutation,
  UpdateOwnBezorgerProfileMutationVariables,
} from '@vaccin-delivery/types'
export {
  CompleteApothekerProfileDocument as COMPLETE_APOTHEKER_PROFILE_MUTATION,
  UpdateOwnApothekerProfileDocument as UPDATE_OWN_APOTHEKER_PROFILE_MUTATION,
  CompleteBezorgerProfileDocument as COMPLETE_BEZORGER_PROFILE_MUTATION,
  UpdateOwnBezorgerProfileDocument as UPDATE_OWN_BEZORGER_PROFILE_MUTATION,
} from '@vaccin-delivery/types'
