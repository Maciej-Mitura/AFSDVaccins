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

import { AuthorizationGuard } from '../../authentication/authorization.guard'
import { FirebaseAuthStrategy } from '../../authentication/firebase-auth.strategy'
import { FirebaseService } from '../../authentication/firebase.service'
import { RolesGuard } from '../../user/guards/roles.guard'
import { UserRole } from '../../user/user-role.enum'
import { User } from '../../user/user.entity'
import { UserService } from '../../user/user.service'
import { OrderHistoryInput } from './order-history.input'
import { OrderHistoryResolver } from './order-history.resolver'
import { OrderHistoryService } from './order-history.service'

const ORDER_HISTORY_QUERY = `
  query OrderHistory($input: OrderHistoryInput!) {
    orderHistory(input: $input) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        cursor
        node {
          id
          status
          deliveredAt
          cancelledAt
          cancellationReason
          routeId
        }
      }
    }
  }
`

describe('OrderHistoryResolver (GraphQL)', () => {
  let app: INestApplication
  let server: Server

  const apotheker: User = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    firebaseUid: 'firebase-apotheker',
    email: 'apotheker@example.com',
    firstName: 'Jan',
    lastName: 'Apotheker',
    role: UserRole.APOTHEKER,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const admin: User = {
    ...apotheker,
    _id: '507f1f77bcf86cd799439012',
    id: '507f1f77bcf86cd799439012',
    firebaseUid: 'firebase-admin',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
  }

  const bezorger: User = {
    ...apotheker,
    _id: '507f1f77bcf86cd799439014',
    id: '507f1f77bcf86cd799439014',
    firebaseUid: 'firebase-bezorger',
    email: 'bezorger@example.com',
    role: UserRole.BEZORGER,
  }

  const firebaseServiceMock = {
    verifyIdToken: jest.fn(),
  }

  const userServiceMock = {
    requireByFirebaseUid: jest.fn(),
    findUserById: jest.fn(),
  }

  const orderHistoryServiceMock = {
    findOrderHistory: jest.fn(),
  }

  beforeEach(async () => {
    firebaseServiceMock.verifyIdToken.mockReset()
    userServiceMock.requireByFirebaseUid.mockReset()
    orderHistoryServiceMock.findOrderHistory.mockReset()
    orderHistoryServiceMock.findOrderHistory.mockResolvedValue({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      totalCount: 0,
    })

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule.register({ defaultStrategy: 'firebase-auth' }),
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: join(
            process.cwd(),
            'dist/schema.order-history.test.gql',
          ),
          sortSchema: true,
          context: ({ req, res }: { req: Request; res: Response }) => ({
            req,
            res,
          }),
        }),
      ],
      providers: [
        OrderHistoryResolver,
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
        {
          provide: OrderHistoryService,
          useValue: orderHistoryServiceMock,
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

  it('rejects unauthenticated orderHistory', async () => {
    const response = await request(server)
      .post('/graphql')
      .send({
        query: ORDER_HISTORY_QUERY,
        variables: { input: { first: 10 } },
      })

    const body = response.body as { errors?: Array<{ message: string }> }
    expect(body.errors?.[0]?.message).toContain('Unauthorized')
    expect(orderHistoryServiceMock.findOrderHistory).not.toHaveBeenCalled()
  })

  it('forbids BEZORGER orderHistory', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: bezorger.firebaseUid,
    })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(bezorger)

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: ORDER_HISTORY_QUERY,
        variables: { input: { first: 10 } },
      })

    const body = response.body as { errors?: Array<{ message: string }> }
    expect(body.errors?.[0]?.message).toContain('Forbidden')
    expect(orderHistoryServiceMock.findOrderHistory).not.toHaveBeenCalled()
  })

  it('allows ADMIN orderHistory', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: admin.firebaseUid,
    })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(admin)

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: ORDER_HISTORY_QUERY,
        variables: { input: { first: 10 } },
      })

    const body = response.body as {
      data?: { orderHistory: { totalCount: number } }
      errors?: unknown
    }

    expect(body.errors).toBeUndefined()
    expect(body.data?.orderHistory.totalCount).toBe(0)
    expect(orderHistoryServiceMock.findOrderHistory).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ first: 10 }) as OrderHistoryInput,
    )
  })

  it('allows APOTHEKER orderHistory', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: apotheker.firebaseUid,
    })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(apotheker)

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: ORDER_HISTORY_QUERY,
        variables: { input: {} },
      })

    const body = response.body as { errors?: unknown }
    expect(body.errors).toBeUndefined()
    expect(orderHistoryServiceMock.findOrderHistory).toHaveBeenCalled()
  })
})
