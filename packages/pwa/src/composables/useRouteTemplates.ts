import { computed, ref } from 'vue'
import { ApolloError } from '@apollo/client/core'

import {
  APOTHEKER_PROFILES_QUERY,
  BEZORGER_PROFILES_QUERY,
  type ApothekerProfilesQuery,
  type BezorgerProfilesQuery,
} from '@/assets/graphql/profile.query'
import {
  CREATE_ROUTE_TEMPLATE_MUTATION,
  ROUTE_TEMPLATES_QUERY,
  SET_ROUTE_TEMPLATE_ACTIVE_MUTATION,
  UPDATE_ROUTE_TEMPLATE_MUTATION,
  type CreateRouteTemplateMutation,
  type CreateRouteTemplateMutationVariables,
  type RouteTemplatesQuery,
  type SetRouteTemplateActiveMutation,
  type UpdateRouteTemplateMutation,
  type UpdateRouteTemplateMutationVariables,
} from '@/assets/graphql/route-templates'
import { mapGraphQLError } from '@/composables/useCurrentUser'
import useGraphQL from '@/composables/useGraphQL'
import { translate } from '@/i18n'

export type RouteTemplateListItem =
  RouteTemplatesQuery['routeTemplates'][number]
export type ApothekerProfileOption =
  ApothekerProfilesQuery['apothekerProfiles'][number]
export type BezorgerProfileOption =
  BezorgerProfilesQuery['bezorgerProfiles'][number]

export type RouteTemplateWriteOutcome = {
  template: RouteTemplateListItem
  deactivatedTemplateIds: string[]
}

const templates = ref<RouteTemplateListItem[]>([])
const apothekerProfiles = ref<ApothekerProfileOption[]>([])
const bezorgerProfiles = ref<BezorgerProfileOption[]>([])
const loading = ref(false)
const profilesLoading = ref(false)
const errorMessage = ref<string | null>(null)

function extractGraphQLErrorCode(error: unknown): string | null {
  if (!(error instanceof ApolloError)) {
    return null
  }

  for (const graphQLError of error.graphQLErrors) {
    const code = graphQLError.extensions?.code
    if (
      typeof code === 'string' &&
      code.length > 0 &&
      code !== 'INTERNAL_SERVER_ERROR' &&
      code !== 'GRAPHQL_VALIDATION_FAILED'
    ) {
      return code
    }

    const originalError = graphQLError.extensions?.originalError as
      | { error?: string }
      | undefined
    if (typeof originalError?.error === 'string' && originalError.error.length > 0) {
      return originalError.error
    }
  }

  return null
}

function markDeactivatedLocally(deactivatedTemplateIds: string[]): void {
  if (deactivatedTemplateIds.length === 0) {
    return
  }

  const deactivated = new Set(deactivatedTemplateIds)
  templates.value = templates.value.map(template =>
    deactivated.has(template.id) ? { ...template, active: false } : template,
  )
}

export function useRouteTemplates() {
  const { apolloClient } = useGraphQL()

  const activeTemplates = computed(() =>
    templates.value.filter(template => template.active),
  )

  async function loadRouteTemplates(includeInactive = false): Promise<void> {
    loading.value = true
    errorMessage.value = null

    try {
      const result = await apolloClient.query<RouteTemplatesQuery>({
        query: ROUTE_TEMPLATES_QUERY,
        variables: { includeInactive },
        fetchPolicy: 'network-only',
      })

      templates.value = result.data.routeTemplates
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function loadProfileOptions(): Promise<void> {
    profilesLoading.value = true

    try {
      const [apothekerResult, bezorgerResult] = await Promise.all([
        apolloClient.query<ApothekerProfilesQuery>({
          query: APOTHEKER_PROFILES_QUERY,
          fetchPolicy: 'network-only',
        }),
        apolloClient.query<BezorgerProfilesQuery>({
          query: BEZORGER_PROFILES_QUERY,
          fetchPolicy: 'network-only',
        }),
      ])

      apothekerProfiles.value = apothekerResult.data.apothekerProfiles
      bezorgerProfiles.value = bezorgerResult.data.bezorgerProfiles
    } catch (error: unknown) {
      errorMessage.value = mapGraphQLError(error)
      throw error
    } finally {
      profilesLoading.value = false
    }
  }

  async function createRouteTemplate(
    input: CreateRouteTemplateMutationVariables['input'],
  ): Promise<RouteTemplateWriteOutcome> {
    const result = await apolloClient.mutate<CreateRouteTemplateMutation>({
      mutation: CREATE_ROUTE_TEMPLATE_MUTATION,
      variables: { input },
    })

    const writeResult = result.data?.createRouteTemplate
    if (!writeResult?.template) {
      throw new Error(translate('errors.routeTemplate.createFailed'))
    }

    markDeactivatedLocally(writeResult.deactivatedTemplateIds)
    templates.value = [...templates.value, writeResult.template]
    return {
      template: writeResult.template,
      deactivatedTemplateIds: writeResult.deactivatedTemplateIds,
    }
  }

  async function updateRouteTemplate(
    id: string,
    input: UpdateRouteTemplateMutationVariables['input'],
  ): Promise<RouteTemplateWriteOutcome> {
    const result = await apolloClient.mutate<UpdateRouteTemplateMutation>({
      mutation: UPDATE_ROUTE_TEMPLATE_MUTATION,
      variables: { id, input },
    })

    const writeResult = result.data?.updateRouteTemplate
    if (!writeResult?.template) {
      throw new Error(translate('errors.routeTemplate.updateFailed'))
    }

    markDeactivatedLocally(writeResult.deactivatedTemplateIds)
    templates.value = templates.value.map(template =>
      template.id === id ? writeResult.template : template,
    )
    return {
      template: writeResult.template,
      deactivatedTemplateIds: writeResult.deactivatedTemplateIds,
    }
  }

  async function setRouteTemplateActive(
    id: string,
    active: boolean,
  ): Promise<RouteTemplateWriteOutcome> {
    const result = await apolloClient.mutate<SetRouteTemplateActiveMutation>({
      mutation: SET_ROUTE_TEMPLATE_ACTIVE_MUTATION,
      variables: { id, active },
    })

    const writeResult = result.data?.setRouteTemplateActive
    if (!writeResult?.template) {
      throw new Error(translate('errors.routeTemplate.statusUpdateFailed'))
    }

    markDeactivatedLocally(writeResult.deactivatedTemplateIds)
    templates.value = templates.value.map(template =>
      template.id === id
        ? { ...template, ...writeResult.template }
        : template,
    )

    return {
      template: templates.value.find(template => template.id === id)!,
      deactivatedTemplateIds: writeResult.deactivatedTemplateIds,
    }
  }

  function findApothekerProfile(
    id: string,
  ): ApothekerProfileOption | undefined {
    return apothekerProfiles.value.find(profile => profile.id === id)
  }

  function findBezorgerProfile(id: string): BezorgerProfileOption | undefined {
    return bezorgerProfiles.value.find(profile => profile.id === id)
  }

  function formatPharmacyLabel(profile: ApothekerProfileOption): string {
    const { address } = profile
    return `${profile.pharmacyName} — ${address.street} ${address.houseNumber}, ${address.postalCode} ${address.city}`
  }

  function isRouteTemplateAlreadyExistsError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'ROUTE_TEMPLATE_ALREADY_EXISTS'
  }

  function isRouteTemplateDuplicateStopError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'ROUTE_TEMPLATE_DUPLICATE_STOP'
  }

  function isRouteTemplateEmptyStopsError(error: unknown): boolean {
    return extractGraphQLErrorCode(error) === 'ROUTE_TEMPLATE_EMPTY_STOPS'
  }

  return {
    templates,
    activeTemplates,
    apothekerProfiles,
    bezorgerProfiles,
    loading,
    profilesLoading,
    errorMessage,
    loadRouteTemplates,
    loadProfileOptions,
    createRouteTemplate,
    updateRouteTemplate,
    setRouteTemplateActive,
    findApothekerProfile,
    findBezorgerProfile,
    formatPharmacyLabel,
    isRouteTemplateAlreadyExistsError,
    isRouteTemplateDuplicateStopError,
    isRouteTemplateEmptyStopsError,
    mapGraphQLError,
  }
}
