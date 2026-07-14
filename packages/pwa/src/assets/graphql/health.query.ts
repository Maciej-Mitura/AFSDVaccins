import gql from 'graphql-tag'

/** Operation source consumed by GraphQL Code Generator. */
export const healthQuerySource = gql`
  query Health {
    health {
      status
      service
      timestamp
      environment
    }
  }
`

export type { HealthQuery, HealthQueryVariables } from '@vaccin-delivery/types'
export { HealthDocument as HEALTH_QUERY } from '@vaccin-delivery/types'
