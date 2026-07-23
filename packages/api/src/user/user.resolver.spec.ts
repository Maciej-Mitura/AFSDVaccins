import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { PassportModule } from '@nestjs/passport'
import { Test, TestingModule } from '@nestjs/testing'
import { join } from 'node:path'
import request from 'supertest'
import { Request, Response } from 'express'
import type { Server } from 'node:http'

import { AuthorizationGuard } from '../authentication/authorization.guard'
import { StrictIdentityThrottlerGuard } from '../common/throttling/strict-identity-throttler.guard'
import { FirebaseAuthStrategy } from '../authentication/firebase-auth.strategy'
import { FirebaseService } from '../authentication/firebase.service'
import { UserRole } from './user-role.enum'
import { User } from './user.entity'
import { UserResolver } from './user.resolver'
import { UserService } from './user.service'
import { RolesGuard } from './guards/roles.guard'

const CURRENT_USER_QUERY = `
  query CurrentUser {
    currentUser {
      id
      email
      firstName
      lastName
      role
    }
  }
`

const CREATE_OWN_USER_MUTATION = `
  mutation CreateOwnUser($input: CreateOwnUserInput!) {
    createOwnUser(input: $input) {
      id
      email
      firstName
      lastName
      role
    }
  }
`

describe('UserResolver (GraphQL)', () => {
  let app: INestApplication
  let server: Server

  const mockUser: User = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    firebaseUid: 'firebase-uid-123',
    email: 'user@example.com',
    firstName: 'Jan',
    lastName: 'Apotheker',
    role: UserRole.APOTHEKER,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const firebaseServiceMock = {
    verifyIdToken: jest.fn(),
  }

  const userServiceMock = {
    createOwnUser: jest.fn(),
    requireByFirebaseUid: jest.fn(),
    updateOwnUser: jest.fn(),
  }

  beforeEach(async () => {
    firebaseServiceMock.verifyIdToken.mockReset()
    userServiceMock.createOwnUser.mockReset()
    userServiceMock.requireByFirebaseUid.mockReset()

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule.register({ defaultStrategy: 'firebase-auth' }),
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: join(process.cwd(), 'dist/schema.user.test.gql'),
          sortSchema: true,
          context: ({ req, res }: { req: Request; res: Response }) => ({
            req,
            res,
          }),
        }),
      ],
      providers: [
        UserResolver,
        FirebaseAuthStrategy,
        AuthorizationGuard,
        RolesGuard,
        {
          provide: FirebaseService,
          useValue: firebaseServiceMock,
        },
        {
          provide: UserService,
          useValue: userServiceMock,
        },
      ],
    })
      .overrideGuard(StrictIdentityThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()
    server = app.getHttpServer() as Server
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects unauthenticated currentUser requests', async () => {
    const response = await request(server)
      .post('/graphql')
      .send({ query: CURRENT_USER_QUERY })

    const body = response.body as {
      data?: { currentUser?: User }
      errors?: Array<{ message: string }>
    }

    expect(response.status).toBe(200)
    expect(body.data?.currentUser).toBeUndefined()
    expect(body.errors?.[0]?.message).toMatch(/Unauthorized/i)
  })

  it('returns the application user for authenticated requests', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: mockUser.firebaseUid,
      email: mockUser.email,
      email_verified: true,
    })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(mockUser)

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: CURRENT_USER_QUERY })

    const body = response.body as {
      data?: { currentUser: User }
      errors?: Array<{ message: string }>
    }

    expect(response.status).toBe(200)
    expect(body.errors).toBeUndefined()
    expect(body.data?.currentUser).toMatchObject({
      email: mockUser.email,
      firstName: mockUser.firstName,
      lastName: mockUser.lastName,
      role: mockUser.role,
    })
  })

  it('creates the application user from the verified Firebase identity', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: mockUser.firebaseUid,
      email: mockUser.email,
      email_verified: true,
    })
    userServiceMock.createOwnUser.mockResolvedValue(mockUser)

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: CREATE_OWN_USER_MUTATION,
        variables: {
          input: {
            firstName: 'Jan',
            lastName: 'Apotheker',
            role: 'APOTHEKER',
          },
        },
      })

    const body = response.body as {
      data?: { createOwnUser: User }
      errors?: Array<{ message: string }>
    }

    expect(response.status).toBe(200)
    expect(body.errors).toBeUndefined()
    expect(userServiceMock.createOwnUser).toHaveBeenCalledWith(
      expect.objectContaining({ uid: mockUser.firebaseUid }),
      expect.objectContaining({
        firstName: 'Jan',
        lastName: 'Apotheker',
        role: 'APOTHEKER',
      }),
    )
    expect(body.data?.createOwnUser.role).toBe(UserRole.APOTHEKER)
  })

  it('rejects ADMIN as a self-registration role at the GraphQL layer', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: mockUser.firebaseUid,
      email: mockUser.email,
      email_verified: true,
    })

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: CREATE_OWN_USER_MUTATION,
        variables: {
          input: {
            firstName: 'Jan',
            lastName: 'Admin',
            role: 'ADMIN',
          },
        },
      })

    const body = response.body as {
      data?: { createOwnUser?: User }
      errors?: Array<{ message: string }>
    }

    expect(response.status).toBe(200)
    expect(body.data?.createOwnUser).toBeFalsy()
    expect(body.errors?.[0]?.message).toMatch(/SelfRegistrationRole|ADMIN/i)
    expect(userServiceMock.createOwnUser).not.toHaveBeenCalled()
  })

  it('rejects missing role on createOwnUser', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: mockUser.firebaseUid,
      email: mockUser.email,
      email_verified: true,
    })

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: CREATE_OWN_USER_MUTATION,
        variables: {
          input: {
            firstName: 'Jan',
            lastName: 'Apotheker',
          },
        },
      })

    const body = response.body as {
      data?: { createOwnUser?: User }
      errors?: Array<{ message: string }>
    }

    expect(response.status).toBe(200)
    expect(body.data?.createOwnUser).toBeFalsy()
    expect(body.errors?.[0]?.message).toMatch(/role/i)
    expect(userServiceMock.createOwnUser).not.toHaveBeenCalled()
  })
})
