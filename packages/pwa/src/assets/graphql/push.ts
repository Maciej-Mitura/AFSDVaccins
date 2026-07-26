import gql from 'graphql-tag'

export const myPushCapabilityQuerySource = gql`
  query MyPushCapability {
    myPushCapability {
      enabled
      subscriptionCount
      provider
      vapidPublicKey
      permissionGuidance
    }
  }
`

export type { MyPushCapabilityQuery } from '@vaccin-delivery/types'
export { MyPushCapabilityDocument as MY_PUSH_CAPABILITY_QUERY } from '@vaccin-delivery/types'

export const registerPushSubscriptionMutationSource = gql`
  mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
    registerPushSubscription(input: $input) {
      enabled
      subscriptionCount
      provider
      vapidPublicKey
      permissionGuidance
    }
  }
`

export type {
  RegisterPushSubscriptionMutation,
  RegisterPushSubscriptionMutationVariables,
} from '@vaccin-delivery/types'
export { RegisterPushSubscriptionDocument as REGISTER_PUSH_SUBSCRIPTION_MUTATION } from '@vaccin-delivery/types'

export const disablePushSubscriptionMutationSource = gql`
  mutation DisablePushSubscription($input: DisablePushSubscriptionInput) {
    disablePushSubscription(input: $input) {
      enabled
      subscriptionCount
      provider
      vapidPublicKey
      permissionGuidance
    }
  }
`

export type {
  DisablePushSubscriptionMutation,
  DisablePushSubscriptionMutationVariables,
} from '@vaccin-delivery/types'
export { DisablePushSubscriptionDocument as DISABLE_PUSH_SUBSCRIPTION_MUTATION } from '@vaccin-delivery/types'
