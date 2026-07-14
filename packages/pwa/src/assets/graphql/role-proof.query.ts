import gql from 'graphql-tag'

export const roleProofQueriesSource = gql`
  query ApothekerArea {
    apothekerArea
  }

  query AdminArea {
    adminArea
  }

  query BezorgerArea {
    bezorgerArea
  }
`

export type {
  ApothekerAreaQuery,
  AdminAreaQuery,
  BezorgerAreaQuery,
} from '@vaccin-delivery/types'
export {
  ApothekerAreaDocument as APOTHEKER_AREA_QUERY,
  AdminAreaDocument as ADMIN_AREA_QUERY,
  BezorgerAreaDocument as BEZORGER_AREA_QUERY,
} from '@vaccin-delivery/types'
