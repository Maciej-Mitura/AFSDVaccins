import { UnauthorizedException } from '@nestjs/common'
import { GraphQLError } from 'graphql'

export class UserNotRegisteredException extends UnauthorizedException {
  constructor() {
    super('Application user not registered')
  }

  toGraphQLError(): GraphQLError {
    return new GraphQLError('Application user not registered', {
      extensions: {
        code: 'USER_NOT_REGISTERED',
      },
    })
  }
}
