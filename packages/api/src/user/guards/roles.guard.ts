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

    const gqlContext = getGraphqlRequestContext(context)
    const normalized = resolveNormalizedGraphqlRequest(gqlContext)
    syncAuthToRequest(gqlContext, normalized)

    const request = gqlContext.req

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
}
