import { computed, ref } from 'vue'
import { ApolloError } from '@apollo/client/core'

import {
  CREATE_VACCINE_MUTATION,
  SET_VACCINE_ACTIVE_MUTATION,
  UPDATE_VACCINE_MUTATION,
  VACCINES_QUERY,
  type CreateVaccineMutation,
  type CreateVaccineMutationVariables,
  type SetVaccineActiveMutation,
  type UpdateVaccineMutation,
  type UpdateVaccineMutationVariables,
  type VaccinesQuery,
} from '@/assets/graphql/vaccine'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL from '@/composables/useGraphQL'
import { translate } from '@/i18n'

export type VaccineListItem = VaccinesQuery['vaccines'][number]

const vaccines = ref<VaccineListItem[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)

function extractGraphQLErrorCode(error: unknown): string | null {
  if (!(error instanceof ApolloError)) {
    return null
  }

  const graphQLError = error.graphQLErrors[0]
  const originalError = graphQLError?.extensions?.originalError as
    { error?: string } | undefined

  return originalError?.error ?? null
}

export function useVaccines() {
  const { apolloClient } = useGraphQL()

  const activeVaccines = computed(() =>
    vaccines.value.filter(vaccine => vaccine.active),
  )

  async function loadVaccines(includeInactive = false): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<VaccinesQuery>({
        query: VACCINES_QUERY,
        variables: { includeInactive },
        fetchPolicy: 'network-only',
      })

      vaccines.value = result.data.vaccines
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function createVaccine(
    input: CreateVaccineMutationVariables['input'],
  ): Promise<VaccineListItem> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.mutate<CreateVaccineMutation>({
        mutation: CREATE_VACCINE_MUTATION,
        variables: { input },
      })

      if (!result.data?.createVaccine) {
        throw new Error(translate('errors.vaccine.createFailed'))
      }

      const created = result.data.createVaccine
      vaccines.value = [...vaccines.value, created]
      return created
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function updateVaccine(
    id: string,
    input: UpdateVaccineMutationVariables['input'],
  ): Promise<VaccineListItem> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.mutate<UpdateVaccineMutation>({
        mutation: UPDATE_VACCINE_MUTATION,
        variables: { id, input },
      })

      if (!result.data?.updateVaccine) {
        throw new Error(translate('errors.vaccine.updateFailed'))
      }

      const updated = result.data.updateVaccine
      vaccines.value = vaccines.value.map(vaccine =>
        vaccine.id === id ? updated : vaccine,
      )

      return updated
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function setVaccineActive(
    id: string,
    active: boolean,
  ): Promise<VaccineListItem> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.mutate<SetVaccineActiveMutation>({
        mutation: SET_VACCINE_ACTIVE_MUTATION,
        variables: { id, active },
      })

      if (!result.data?.setVaccineActive) {
        throw new Error(translate('errors.vaccine.statusUpdateFailed'))
      }

      vaccines.value = vaccines.value.map(vaccine =>
        vaccine.id === id
          ? { ...vaccine, ...result.data!.setVaccineActive }
          : vaccine,
      )

      return vaccines.value.find(vaccine => vaccine.id === id)!
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  function isVaccineAlreadyExistsError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'VACCINE_ALREADY_EXISTS'
  }

  function isVaccineNotFoundError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'VACCINE_NOT_FOUND'
  }

  return {
    vaccines,
    activeVaccines,
    loading,
    errorMessage,
    loadVaccines,
    createVaccine,
    updateVaccine,
    setVaccineActive,
    isVaccineAlreadyExistsError,
    isVaccineNotFoundError,
    mapGraphQLError,
  }
}
