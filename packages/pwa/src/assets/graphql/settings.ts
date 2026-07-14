import gql from 'graphql-tag'

export const applicationSettingsQuerySource = gql`
  query ApplicationSettings {
    applicationSettings {
      id
      timezone
      orderingClosingTime
      weeklyWarningPercentage
      createdAt
      updatedAt
    }
  }
`

export type {
  ApplicationSettingsQuery,
  ApplicationSettingsQueryVariables,
} from '@vaccin-delivery/types'
export { ApplicationSettingsDocument as APPLICATION_SETTINGS_QUERY } from '@vaccin-delivery/types'

export const updateApplicationSettingsMutationSource = gql`
  mutation UpdateApplicationSettings($input: UpdateApplicationSettingsInput!) {
    updateApplicationSettings(input: $input) {
      id
      timezone
      orderingClosingTime
      weeklyWarningPercentage
      updatedAt
    }
  }
`

export type {
  UpdateApplicationSettingsMutation,
  UpdateApplicationSettingsMutationVariables,
} from '@vaccin-delivery/types'
export { UpdateApplicationSettingsDocument as UPDATE_APPLICATION_SETTINGS_MUTATION } from '@vaccin-delivery/types'
