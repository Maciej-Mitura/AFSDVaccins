import { registerEnumType } from '@nestjs/graphql'

/**
 * Roles allowed for public self-registration.
 * ADMIN is intentionally omitted from this GraphQL enum.
 */
export enum SelfRegistrationRole {
  APOTHEKER = 'APOTHEKER',
  BEZORGER = 'BEZORGER',
}

registerEnumType(SelfRegistrationRole, {
  name: 'SelfRegistrationRole',
  description: 'Account types available during public self-registration',
})
