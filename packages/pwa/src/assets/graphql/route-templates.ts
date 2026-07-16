import gql from 'graphql-tag'

export const routeTemplatesQuerySource = gql`
  query RouteTemplates($includeInactive: Boolean = false) {
    routeTemplates(includeInactive: $includeInactive) {
      id
      name
      description
      active
      bezorgerProfileId
      stops {
        apothekerProfileId
        sequence
      }
      createdAt
      updatedAt
      createdByUserId
      updatedByUserId
    }
  }
`

export type {
  RouteTemplatesQuery,
  RouteTemplatesQueryVariables,
} from '@vaccin-delivery/types'
export { RouteTemplatesDocument as ROUTE_TEMPLATES_QUERY } from '@vaccin-delivery/types'

export const routeTemplateQuerySource = gql`
  query RouteTemplate($id: ID!) {
    routeTemplate(id: $id) {
      id
      name
      description
      active
      bezorgerProfileId
      stops {
        apothekerProfileId
        sequence
      }
      createdAt
      updatedAt
      createdByUserId
      updatedByUserId
    }
  }
`

export type {
  RouteTemplateQuery,
  RouteTemplateQueryVariables,
} from '@vaccin-delivery/types'
export { RouteTemplateDocument as ROUTE_TEMPLATE_QUERY } from '@vaccin-delivery/types'

export const createRouteTemplateMutationSource = gql`
  mutation CreateRouteTemplate($input: CreateRouteTemplateInput!) {
    createRouteTemplate(input: $input) {
      id
      name
      description
      active
      bezorgerProfileId
      stops {
        apothekerProfileId
        sequence
      }
      createdAt
      updatedAt
      createdByUserId
      updatedByUserId
    }
  }
`

export type {
  CreateRouteTemplateMutation,
  CreateRouteTemplateMutationVariables,
} from '@vaccin-delivery/types'
export { CreateRouteTemplateDocument as CREATE_ROUTE_TEMPLATE_MUTATION } from '@vaccin-delivery/types'

export const updateRouteTemplateMutationSource = gql`
  mutation UpdateRouteTemplate($id: ID!, $input: UpdateRouteTemplateInput!) {
    updateRouteTemplate(id: $id, input: $input) {
      id
      name
      description
      active
      bezorgerProfileId
      stops {
        apothekerProfileId
        sequence
      }
      createdAt
      updatedAt
      createdByUserId
      updatedByUserId
    }
  }
`

export type {
  UpdateRouteTemplateMutation,
  UpdateRouteTemplateMutationVariables,
} from '@vaccin-delivery/types'
export { UpdateRouteTemplateDocument as UPDATE_ROUTE_TEMPLATE_MUTATION } from '@vaccin-delivery/types'

export const setRouteTemplateActiveMutationSource = gql`
  mutation SetRouteTemplateActive($id: ID!, $active: Boolean!) {
    setRouteTemplateActive(id: $id, active: $active) {
      id
      active
      updatedAt
      updatedByUserId
    }
  }
`

export type {
  SetRouteTemplateActiveMutation,
  SetRouteTemplateActiveMutationVariables,
} from '@vaccin-delivery/types'
export { SetRouteTemplateActiveDocument as SET_ROUTE_TEMPLATE_ACTIVE_MUTATION } from '@vaccin-delivery/types'
