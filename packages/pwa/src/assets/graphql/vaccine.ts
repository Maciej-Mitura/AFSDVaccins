import gql from 'graphql-tag'

/** Shared safe VaccineImage selection — never requests blob object keys. */
export const vaccineImageFieldsSource = gql`
  fragment VaccineImageFields on VaccineImage {
    originalFilename
    mimeType
    width
    height
    validationStatus
    aiCaption
    aiConfidence
    aiTags
    aiReason
    uploadedAt
    imageUrl
  }
`

export const vaccinesQuerySource = gql`
  query Vaccines($includeInactive: Boolean = false) {
    vaccines(includeInactive: $includeInactive) {
      id
      name
      description
      manufacturer
      stockQuantity
      stockWarningThreshold
      active
      createdAt
      updatedAt
      image {
        originalFilename
        mimeType
        width
        height
        validationStatus
        aiCaption
        aiConfidence
        aiTags
        aiReason
        uploadedAt
        imageUrl
      }
    }
  }
`

export type {
  VaccinesQuery,
  VaccinesQueryVariables,
} from '@vaccin-delivery/types'
export { VaccinesDocument as VACCINES_QUERY } from '@vaccin-delivery/types'

export const vaccineQuerySource = gql`
  query Vaccine($id: ID!) {
    vaccine(id: $id) {
      id
      name
      description
      manufacturer
      stockQuantity
      stockWarningThreshold
      active
      createdAt
      updatedAt
      image {
        originalFilename
        mimeType
        width
        height
        validationStatus
        aiCaption
        aiConfidence
        aiTags
        aiReason
        uploadedAt
        imageUrl
      }
    }
  }
`

export type {
  VaccineQuery,
  VaccineQueryVariables,
} from '@vaccin-delivery/types'
export { VaccineDocument as VACCINE_QUERY } from '@vaccin-delivery/types'

export const createVaccineMutationSource = gql`
  mutation CreateVaccine($input: CreateVaccineInput!) {
    createVaccine(input: $input) {
      id
      name
      description
      manufacturer
      stockQuantity
      stockWarningThreshold
      active
      createdAt
      updatedAt
      image {
        originalFilename
        mimeType
        width
        height
        validationStatus
        aiCaption
        aiConfidence
        aiTags
        aiReason
        uploadedAt
        imageUrl
      }
    }
  }
`

export type {
  CreateVaccineMutation,
  CreateVaccineMutationVariables,
} from '@vaccin-delivery/types'
export { CreateVaccineDocument as CREATE_VACCINE_MUTATION } from '@vaccin-delivery/types'

export const updateVaccineMutationSource = gql`
  mutation UpdateVaccine($id: ID!, $input: UpdateVaccineInput!) {
    updateVaccine(id: $id, input: $input) {
      id
      name
      description
      manufacturer
      stockQuantity
      stockWarningThreshold
      active
      createdAt
      updatedAt
      image {
        originalFilename
        mimeType
        width
        height
        validationStatus
        aiCaption
        aiConfidence
        aiTags
        aiReason
        uploadedAt
        imageUrl
      }
    }
  }
`

export type {
  UpdateVaccineMutation,
  UpdateVaccineMutationVariables,
} from '@vaccin-delivery/types'
export { UpdateVaccineDocument as UPDATE_VACCINE_MUTATION } from '@vaccin-delivery/types'

export const setVaccineActiveMutationSource = gql`
  mutation SetVaccineActive($id: ID!, $active: Boolean!) {
    setVaccineActive(id: $id, active: $active) {
      id
      active
      updatedAt
    }
  }
`

export type {
  SetVaccineActiveMutation,
  SetVaccineActiveMutationVariables,
} from '@vaccin-delivery/types'
export { SetVaccineActiveDocument as SET_VACCINE_ACTIVE_MUTATION } from '@vaccin-delivery/types'
