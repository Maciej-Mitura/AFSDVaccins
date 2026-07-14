import gql from 'graphql-tag'

export const HEALTH_QUERY = gql`
  query Health {
    health {
      status
      service
      timestamp
      environment
    }
  }
`
