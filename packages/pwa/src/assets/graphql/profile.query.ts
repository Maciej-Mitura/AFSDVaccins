import gql from 'graphql-tag'

export const currentApothekerProfileQuerySource = gql`
  query CurrentApothekerProfile {
    currentApothekerProfile {
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

export const currentBezorgerProfileQuerySource = gql`
  query CurrentBezorgerProfile {
    currentBezorgerProfile {
      id
      userId
      displayName
      vehicleLabel
      createdAt
      updatedAt
    }
  }
`

export const apothekerProfilesQuerySource = gql`
  query ApothekerProfiles {
    apothekerProfiles {
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

export const bezorgerProfilesQuerySource = gql`
  query BezorgerProfiles {
    bezorgerProfiles {
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
  CurrentApothekerProfileQuery,
  CurrentApothekerProfileQueryVariables,
  CurrentBezorgerProfileQuery,
  CurrentBezorgerProfileQueryVariables,
  ApothekerProfilesQuery,
  ApothekerProfilesQueryVariables,
  BezorgerProfilesQuery,
  BezorgerProfilesQueryVariables,
} from '@vaccin-delivery/types'
export {
  CurrentApothekerProfileDocument as CURRENT_APOTHEKER_PROFILE_QUERY,
  CurrentBezorgerProfileDocument as CURRENT_BEZORGER_PROFILE_QUERY,
  ApothekerProfilesDocument as APOTHEKER_PROFILES_QUERY,
  BezorgerProfilesDocument as BEZORGER_PROFILES_QUERY,
} from '@vaccin-delivery/types'
