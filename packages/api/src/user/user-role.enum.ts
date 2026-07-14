import { registerEnumType } from '@nestjs/graphql'

export enum UserRole {
  APOTHEKER = 'APOTHEKER',
  ADMIN = 'ADMIN',
  BEZORGER = 'BEZORGER',
}

registerEnumType(UserRole, {
  name: 'UserRole',
  description: 'Application role assigned server-side',
})
