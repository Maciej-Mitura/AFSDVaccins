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

import { AuthenticationResolver } from './authentication.resolver'
import { AuthorizationGuard } from './authorization.guard'
import { FirebaseAuthStrategy } from './firebase-auth.strategy'
import { FirebaseService } from './firebase.service'
import { VerifiedFirebaseIdentity } from './firebase.types'

const CURRENT_FIREBASE_USER_QUERY = `
  query CurrentFirebaseUser {
    currentFirebaseUser {
      uid
      email
      displayName
      emailVerified
    }
  }
`

type CurrentFirebaseUserResponse = {
  data?: {
    currentFirebaseUser: VerifiedFirebaseIdentity
  }
  errors?: Array<{ message: string }>
}

describe('AuthenticationResolver (GraphQL)', () => {
  let app: INestApplication
  let server: Server

  const mockIdentity: VerifiedFirebaseIdentity = {
    uid: 'firebase-uid-123',
    email: 'user@example.com',
    displayName: 'Test User',
    emailVerified: true,
  }

  const firebaseServiceMock = {
    verifyIdToken: jest.fn(),
  }

  beforeEach(async () => {
    firebaseServiceMock.verifyIdToken.mockReset()

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule.register({ defaultStrategy: 'firebase-auth' }),
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: join(process.cwd(), 'dist/schema.test.gql'),
          sortSchema: true,
          context: ({ req, res }: { req: Request; res: Response }) => ({
            req,
            res,
          }),
        }),
      ],
      providers: [
        AuthenticationResolver,
        FirebaseAuthStrategy,
        AuthorizationGuard,
        {
          provide: FirebaseService,
          useValue: firebaseServiceMock,
        },
      ],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
    server = app.getHttpServer() as Server
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects unauthenticated requests', async () => {
    const response = await request(server)
      .post('/graphql')
      .send({ query: CURRENT_FIREBASE_USER_QUERY })

    const body = response.body as CurrentFirebaseUserResponse

    expect(response.status).toBe(200)
    expect(body.data?.currentFirebaseUser).toBeUndefined()
    expect(body.errors?.[0]?.message).toMatch(/Unauthorized/i)
  })

  it('returns the verified Firebase identity for authenticated requests', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: mockIdentity.uid,
      email: mockIdentity.email,
      email_verified: mockIdentity.emailVerified,
      name: mockIdentity.displayName,
    })

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: CURRENT_FIREBASE_USER_QUERY })

    const body = response.body as CurrentFirebaseUserResponse

    expect(response.status).toBe(200)
    expect(body.errors).toBeUndefined()
    expect(body.data?.currentFirebaseUser).toEqual(mockIdentity)
    expect(firebaseServiceMock.verifyIdToken).toHaveBeenCalledWith(
      'valid-token',
    )
  })
})
