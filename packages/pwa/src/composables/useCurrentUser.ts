import { computed, ref } from 'vue'
import { ApolloError } from '@apollo/client/core'
import { UserRole } from '@vaccin-delivery/types'

import {
  CREATE_OWN_USER_MUTATION,
  UPDATE_OWN_USER_MUTATION,
  type CreateOwnUserMutation,
  type UpdateOwnUserMutation,
} from '@/assets/graphql/user.mutation'
import {
  CURRENT_USER_QUERY,
  type CurrentUserQuery,
} from '@/assets/graphql/current-user.query'
import useGraphQL from '@/composables/useGraphQL'

export type ApplicationUser = NonNullable<CurrentUserQuery['currentUser']>
export type ApplicationRole = ApplicationUser['role']

const currentUser = ref<ApplicationUser | null>(null)
const loading = ref(false)
const initialized = ref(false)
const missingProfile = ref(false)

let loadPromise: Promise<void> | null = null

function isUserNotRegisteredError(error: unknown): boolean {
  if (!(error instanceof ApolloError)) {
    return false
  }

  return error.graphQLErrors.some(graphQLError => {
    const originalError = graphQLError.extensions?.originalError as
      { error?: string } | undefined

    return (
      graphQLError.extensions?.code === 'USER_NOT_REGISTERED' ||
      originalError?.error === 'USER_NOT_REGISTERED' ||
      graphQLError.message.includes('Application user not registered')
    )
  })
}

function mapGraphQLError(error: unknown): string {
  if (error instanceof ApolloError) {
    const message = error.graphQLErrors[0]?.message
    if (message) {
      return message
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Er ging iets mis. Probeer het opnieuw.'
}

export function getDefaultRouteForRole(role?: UserRole | null): string {
  switch (role) {
    case UserRole.Admin:
      return '/admin'
    case UserRole.Bezorger:
      return '/bezorger'
    default:
      return '/apotheker'
  }
}

export function useCurrentUser() {
  const { apolloClient } = useGraphQL()

  const role = computed(() => currentUser.value?.role ?? null)
  const isRegistered = computed(() => currentUser.value !== null)

  async function loadCurrentUser(force = false): Promise<void> {
    if (!force && initialized.value) {
      return
    }

    if (loadPromise) {
      await loadPromise
      return
    }

    loading.value = true
    missingProfile.value = false

    loadPromise = (async () => {
      try {
        const result = await apolloClient.query<CurrentUserQuery>({
          query: CURRENT_USER_QUERY,
          fetchPolicy: 'network-only',
        })

        currentUser.value = result.data.currentUser ?? null
        missingProfile.value = currentUser.value === null
      } catch (error: unknown) {
        if (isUserNotRegisteredError(error)) {
          currentUser.value = null
          missingProfile.value = true
        } else {
          throw error
        }
      } finally {
        loading.value = false
        initialized.value = true
        loadPromise = null
      }
    })()

    await loadPromise
  }

  async function createOwnUser(
    firstName: string,
    lastName: string,
  ): Promise<ApplicationUser> {
    const result = await apolloClient.mutate<CreateOwnUserMutation>({
      mutation: CREATE_OWN_USER_MUTATION,
      variables: {
        input: {
          firstName,
          lastName,
        },
      },
    })

    if (!result.data?.createOwnUser) {
      throw new Error('Kon het applicatieprofiel niet aanmaken.')
    }

    currentUser.value = result.data.createOwnUser
    missingProfile.value = false
    initialized.value = true

    return result.data.createOwnUser
  }

  async function updateOwnUser(
    firstName: string,
    lastName: string,
  ): Promise<ApplicationUser> {
    const result = await apolloClient.mutate<UpdateOwnUserMutation>({
      mutation: UPDATE_OWN_USER_MUTATION,
      variables: {
        input: {
          firstName,
          lastName,
        },
      },
    })

    if (!result.data?.updateOwnUser) {
      throw new Error('Kon het profiel niet bijwerken.')
    }

    currentUser.value = result.data.updateOwnUser

    return result.data.updateOwnUser
  }

  function clearCurrentUser(): void {
    currentUser.value = null
    missingProfile.value = false
    initialized.value = false
    loading.value = false
    loadPromise = null
  }

  return {
    currentUser,
    role,
    loading,
    initialized,
    missingProfile,
    isRegistered,
    loadCurrentUser,
    createOwnUser,
    updateOwnUser,
    clearCurrentUser,
    getDefaultRouteForRole,
    mapGraphQLError,
  }
}
