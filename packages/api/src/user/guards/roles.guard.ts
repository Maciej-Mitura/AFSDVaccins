import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { GqlExecutionContext } from '@nestjs/graphql'

import { GraphqlRequestContext } from '../../authentication/firebase.types'
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

    const gqlContext = GqlExecutionContext.create(context)
    const request = gqlContext.getContext<GraphqlRequestContext>().req

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
