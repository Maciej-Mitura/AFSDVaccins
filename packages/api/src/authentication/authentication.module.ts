import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { AuthenticationResolver } from './authentication.resolver'
import { AuthorizationGuard } from './authorization.guard'
import { FirebaseAuthStrategy } from './firebase-auth.strategy'
import { FirebaseService } from './firebase.service'

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'firebase-auth' })],
  providers: [
    FirebaseService,
    FirebaseAuthStrategy,
    AuthorizationGuard,
    AuthenticationResolver,
  ],
  exports: [FirebaseService, AuthorizationGuard],
})
export class AuthenticationModule {}
