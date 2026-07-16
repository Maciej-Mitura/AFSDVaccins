import { computed, ref } from 'vue'
import { ApolloError } from '@apollo/client/core'
import { SelfRegistrationRole, UserRole } from '@vaccin-delivery/types'

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
import {
  COMPLETE_APOTHEKER_PROFILE_MUTATION,
  COMPLETE_BEZORGER_PROFILE_MUTATION,
  UPDATE_OWN_APOTHEKER_PROFILE_MUTATION,
  UPDATE_OWN_BEZORGER_PROFILE_MUTATION,
  type CompleteApothekerProfileMutation,
  type CompleteApothekerProfileMutationVariables,
  type CompleteBezorgerProfileMutation,
  type CompleteBezorgerProfileMutationVariables,
  type UpdateOwnApothekerProfileMutation,
  type UpdateOwnApothekerProfileMutationVariables,
  type UpdateOwnBezorgerProfileMutation,
  type UpdateOwnBezorgerProfileMutationVariables,
} from '@/assets/graphql/profile.mutation'
import useGraphQL from '@/composables/useGraphQL'

export type ApplicationUser = NonNullable<CurrentUserQuery['currentUser']>
export type ApplicationRole = ApplicationUser['role']
export type ApothekerProfile = NonNullable<ApplicationUser['apothekerProfile']>
export type BezorgerProfile = NonNullable<ApplicationUser['bezorgerProfile']>

const currentUser = ref<ApplicationUser | null>(null)
const loading = ref(false)
const initialized = ref(false)
const missingProfile = ref(false)

let loadPromise: Promise<void> | null = null
let loadGeneration = 0

function isUserNotRegisteredError(error: unknown): boolean {
  if (!(error instanceof ApolloError)) {
    return false
  }

  return error.graphQLErrors.some(graphQLError => {
    const originalError = graphQLError.extensions?.originalError as
      | { error?: string }
      | undefined

    return (
      graphQLError.extensions?.code === 'USER_NOT_REGISTERED' ||
      originalError?.error === 'USER_NOT_REGISTERED' ||
      graphQLError.message.includes('Application user not registered')
    )
  })
}

export function mapGraphQLError(error: unknown): string {
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

function needsRoleSpecificProfile(user: ApplicationUser | null): boolean {
  if (!user) {
    return false
  }

  if (user.role === UserRole.Apotheker) {
    return user.apothekerProfile == null
  }

  if (user.role === UserRole.Bezorger) {
    return user.bezorgerProfile == null
  }

  return false
}

export function useCurrentUser() {
  const { apolloClient } = useGraphQL()

  const role = computed(() => currentUser.value?.role ?? null)
  const isRegistered = computed(() => currentUser.value !== null)
  const missingRoleProfile = computed(() =>
    needsRoleSpecificProfile(currentUser.value),
  )
  const needsProfileCompletion = computed(
    () => missingProfile.value || missingRoleProfile.value,
  )

  async function loadCurrentUser(force = false): Promise<void> {
    if (!force && initialized.value) {
      return
    }

    if (!force && loadPromise) {
      await loadPromise
      return
    }

    if (force && loadPromise) {
      await loadPromise
    }

    const generation = ++loadGeneration
    loading.value = true
    missingProfile.value = false

    loadPromise = (async () => {
      try {
        if (force) {
          apolloClient.cache.evict({ fieldName: 'currentUser' })
          apolloClient.cache.gc()
        }

        const result = await apolloClient.query<CurrentUserQuery>({
          query: CURRENT_USER_QUERY,
          fetchPolicy: 'network-only',
        })

        if (generation !== loadGeneration) {
          return
        }

        currentUser.value = result.data.currentUser ?? null
        missingProfile.value = currentUser.value === null
      } catch (error: unknown) {
        if (generation !== loadGeneration) {
          return
        }

        if (isUserNotRegisteredError(error)) {
          currentUser.value = null
          missingProfile.value = true
        } else {
          throw error
        }
      } finally {
        if (generation === loadGeneration) {
          loading.value = false
          initialized.value = true
          loadPromise = null
        }
      }
    })()

    await loadPromise
  }

  async function createOwnUser(
    firstName: string,
    lastName: string,
    role: SelfRegistrationRole,
  ): Promise<ApplicationUser> {
    const result = await apolloClient.mutate<CreateOwnUserMutation>({
      mutation: CREATE_OWN_USER_MUTATION,
      variables: {
        input: {
          firstName,
          lastName,
          role,
        },
      },
    })

    if (!result.data?.createOwnUser) {
      throw new Error('Kon het applicatieprofiel niet aanmaken.')
    }

    await loadCurrentUser(true)

    if (!currentUser.value) {
      throw new Error('Kon het applicatieprofiel niet laden.')
    }

    return currentUser.value
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

    await loadCurrentUser(true)

    if (!currentUser.value) {
      throw new Error('Kon het applicatieprofiel niet laden.')
    }

    return currentUser.value
  }

  async function completeApothekerProfile(
    input: CompleteApothekerProfileMutationVariables['input'],
  ): Promise<ApothekerProfile> {
    const result = await apolloClient.mutate<CompleteApothekerProfileMutation>({
      mutation: COMPLETE_APOTHEKER_PROFILE_MUTATION,
      variables: { input },
    })

    if (!result.data?.completeApothekerProfile) {
      throw new Error('Kon het apotheekprofiel niet aanmaken.')
    }

    await loadCurrentUser(true)
    return result.data.completeApothekerProfile
  }

  async function updateOwnApothekerProfile(
    input: UpdateOwnApothekerProfileMutationVariables['input'],
  ): Promise<ApothekerProfile> {
    const result = await apolloClient.mutate<UpdateOwnApothekerProfileMutation>({
      mutation: UPDATE_OWN_APOTHEKER_PROFILE_MUTATION,
      variables: { input },
    })

    if (!result.data?.updateOwnApothekerProfile) {
      throw new Error('Kon het apotheekprofiel niet bijwerken.')
    }

    await loadCurrentUser(true)
    return result.data.updateOwnApothekerProfile
  }

  async function completeBezorgerProfile(
    input: CompleteBezorgerProfileMutationVariables['input'],
  ): Promise<BezorgerProfile> {
    const result = await apolloClient.mutate<CompleteBezorgerProfileMutation>({
      mutation: COMPLETE_BEZORGER_PROFILE_MUTATION,
      variables: { input },
    })

    if (!result.data?.completeBezorgerProfile) {
      throw new Error('Kon het bezorgerprofiel niet aanmaken.')
    }

    await loadCurrentUser(true)
    return result.data.completeBezorgerProfile
  }

  async function updateOwnBezorgerProfile(
    input: UpdateOwnBezorgerProfileMutationVariables['input'],
  ): Promise<BezorgerProfile> {
    const result = await apolloClient.mutate<UpdateOwnBezorgerProfileMutation>({
      mutation: UPDATE_OWN_BEZORGER_PROFILE_MUTATION,
      variables: { input },
    })

    if (!result.data?.updateOwnBezorgerProfile) {
      throw new Error('Kon het bezorgerprofiel niet bijwerken.')
    }

    await loadCurrentUser(true)
    return result.data.updateOwnBezorgerProfile
  }

  function clearCurrentUser(): void {
    currentUser.value = null
    missingProfile.value = false
    initialized.value = false
    loading.value = false
    loadPromise = null
    loadGeneration += 1
  }

  return {
    currentUser,
    role,
    loading,
    initialized,
    missingProfile,
    missingRoleProfile,
    needsProfileCompletion,
    isRegistered,
    loadCurrentUser,
    createOwnUser,
    updateOwnUser,
    completeApothekerProfile,
    updateOwnApothekerProfile,
    completeBezorgerProfile,
    updateOwnBezorgerProfile,
    clearCurrentUser,
    getDefaultRouteForRole,
    mapGraphQLError,
  }
}
