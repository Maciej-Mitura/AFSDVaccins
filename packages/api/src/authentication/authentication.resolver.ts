import { Query, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'

import { AuthorizationGuard } from './authorization.guard'
import { CurrentFirebaseUser } from './current-firebase-user.decorator'
import { FirebaseIdentity } from './firebase-identity.object'

@Resolver()
export class AuthenticationResolver {
  @Query(() => FirebaseIdentity, {
    description: 'Returns the verified Firebase identity from the Bearer token',
  })
  @UseGuards(AuthorizationGuard)
  currentFirebaseUser(
    @CurrentFirebaseUser() identity: FirebaseIdentity,
  ): FirebaseIdentity {
    return identity
  }
}
