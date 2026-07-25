import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import {
  getGraphqlRequestContext,
  resolveNormalizedGraphqlRequest,
  syncAuthToRequest,
} from '../../authentication/graphql-auth.context'
import { UserRole } from '../user-role.enum'
import { UserService } from '../user.service'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { User } from '../user.entity'
import { VerifiedFirebaseIdentity } from '../../authentication/firebase.types'

type AuthedHttpRequest = {
  user?: VerifiedFirebaseIdentity
  applicationUser?: User
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const request = this.resolveAuthedRequest(context)

    if (!request.user?.uid) {
      throw new UnauthorizedException()
    }

    if (!request.applicationUser) {
      request.applicationUser = await this.userService.requireByFirebaseUid(
        request.user.uid,
      )
    }

    if (!requiredRoles.includes(request.applicationUser.role)) {
      throw new ForbiddenException()
    }

    return true
  }

  private resolveAuthedRequest(
    context: ExecutionContext,
  ): AuthedHttpRequest {
    if (context.getType<string>() === 'http') {
      return context.switchToHttp().getRequest<AuthedHttpRequest>()
    }

    const gqlContext = getGraphqlRequestContext(context)
    const normalized = resolveNormalizedGraphqlRequest(gqlContext)
    syncAuthToRequest(gqlContext, normalized)
    return gqlContext.req
  }
}
