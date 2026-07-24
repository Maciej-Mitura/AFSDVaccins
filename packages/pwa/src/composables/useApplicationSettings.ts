import { computed, ref } from 'vue'
import { ApolloError } from '@apollo/client/core'

import {
  APPLICATION_SETTINGS_QUERY,
  UPDATE_APPLICATION_SETTINGS_MUTATION,
  type ApplicationSettingsQuery,
  type UpdateApplicationSettingsMutation,
  type UpdateApplicationSettingsMutationVariables,
} from '@/assets/graphql/settings'
import useGraphQL from '@/composables/useGraphQL'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import { translate } from '@/i18n'

export type ApplicationSettings = NonNullable<
  ApplicationSettingsQuery['applicationSettings']
>

const settings = ref<ApplicationSettings | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

export function useApplicationSettings() {
  const { apolloClient } = useGraphQL()

  const hasSettings = computed(() => settings.value !== null)

  async function loadApplicationSettings(force = false): Promise<void> {
    if (!force && settings.value) {
      return
    }

    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<ApplicationSettingsQuery>({
        query: APPLICATION_SETTINGS_QUERY,
        fetchPolicy: 'network-only',
      })

      settings.value = result.data.applicationSettings
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function updateApplicationSettings(
    input: UpdateApplicationSettingsMutationVariables['input'],
  ): Promise<ApplicationSettings> {
    loading.value = true
    errorMessage.value = null

    try {
      const result =
        await apolloClient.mutate<UpdateApplicationSettingsMutation>({
          mutation: UPDATE_APPLICATION_SETTINGS_MUTATION,
          variables: { input },
        })

      if (!result.data?.updateApplicationSettings) {
        throw new Error(translate('errors.settings.updateFailed'))
      }

      settings.value = {
        ...settings.value,
        ...result.data.updateApplicationSettings,
      } as ApplicationSettings

      return settings.value
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  function isSettingsInvalidError(error: unknown): boolean {
    if (!(error instanceof ApolloError)) {
      return false
    }

    return error.graphQLErrors.some(graphQLError => {
      const originalError = graphQLError.extensions?.originalError as
        { error?: string } | undefined

      return (
        originalError?.error === 'SETTINGS_INVALID' ||
        graphQLError.message.includes('SETTINGS_INVALID')
      )
    })
  }

  return {
    settings,
    hasSettings,
    loading,
    errorMessage,
    loadApplicationSettings,
    updateApplicationSettings,
    isSettingsInvalidError,
    mapGraphQLError,
  }
}
