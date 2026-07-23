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

import { PubSub } from 'graphql-subscriptions'

import { AuthorizationGuard } from '../authentication/authorization.guard'
import { PUB_SUB } from '../common/pubsub/pubsub.constants'
import { StrictIdentityThrottlerGuard } from '../common/throttling/strict-identity-throttler.guard'
import { FirebaseAuthStrategy } from '../authentication/firebase-auth.strategy'
import { FirebaseService } from '../authentication/firebase.service'
import { SettingsService } from '../settings/settings.service'
import { RolesGuard } from '../user/guards/roles.guard'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { UserService } from '../user/user.service'
import { VaccineService } from '../vaccine/vaccine.service'
import { OrderStatus } from './order-status.enum'
import { Order } from './order.entity'
import { OrderResolver } from './order.resolver'
import { OrderService } from './order.service'

const CREATE_ORDER_MUTATION = `
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      id
      status
    }
  }
`

const ADMIN_ORDERS_QUERY = `
  query Orders {
    orders {
      id
    }
  }
`

describe('OrderResolver (GraphQL)', () => {
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

  const order: Order = {
    _id: '6a569d2cbb2590db980429cd',
    id: '6a569d2cbb2590db980429cd',
    apothekerId: apotheker._id,
    status: OrderStatus.PENDING,
    orderLines: [],
    totalQuantity: 5,
    isoWeek: 29,
    isoYear: 2026,
    submittedAt: new Date('2026-07-14T10:00:00.000Z'),
    deliveryDate: '2026-07-14',
    cancelledAt: null,
    createdAt: new Date('2026-07-14T10:00:00.000Z'),
    updatedAt: new Date('2026-07-14T10:00:00.000Z'),
  }

  const firebaseServiceMock = {
    verifyIdToken: jest.fn(),
  }

  const userServiceMock = {
    requireByFirebaseUid: jest.fn(),
    findUserById: jest.fn(),
  }

  const orderServiceMock = {
    createOrder: jest.fn(),
    findMyOrders: jest.fn(),
    findMyOrder: jest.fn(),
    findMyWeeklyOrderSummary: jest.fn(),
    cancelOwnOrder: jest.fn(),
    findOrders: jest.fn(),
    findOrderById: jest.fn(),
  }

  const settingsServiceMock = {
    getApplicationSettings: jest.fn(),
  }

  const vaccineServiceMock = {
    findVaccineEntityById: jest.fn(),
  }

  beforeEach(async () => {
    firebaseServiceMock.verifyIdToken.mockReset()
    userServiceMock.requireByFirebaseUid.mockReset()
    orderServiceMock.createOrder.mockReset()
    orderServiceMock.findOrders.mockReset()

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule.register({ defaultStrategy: 'firebase-auth' }),
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: join(process.cwd(), 'dist/schema.order.test.gql'),
          sortSchema: true,
          context: ({ req, res }: { req: Request; res: Response }) => ({
            req,
            res,
          }),
        }),
      ],
      providers: [
        OrderResolver,
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
          provide: OrderService,
          useValue: orderServiceMock,
        },
        {
          provide: SettingsService,
          useValue: settingsServiceMock,
        },
        {
          provide: VaccineService,
          useValue: vaccineServiceMock,
        },
        {
          provide: PUB_SUB,
          useValue: new PubSub(),
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

  it('rejects unauthenticated createOrder requests', async () => {
    const response = await request(server)
      .post('/graphql')
      .send({
        query: CREATE_ORDER_MUTATION,
        variables: {
          input: {
            lines: [{ vaccineId: '507f1f77bcf86cd799439021', quantity: 1 }],
          },
        },
      })

    const body = response.body as {
      data?: { createOrder?: Order }
      errors?: Array<{ message: string }>
    }

    expect(response.status).toBe(200)
    expect(body.errors?.[0]?.message).toContain('Unauthorized')
    expect(orderServiceMock.createOrder).not.toHaveBeenCalled()
  })

  it('allows APOTHEKER to create an order without client ownership fields', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({ uid: apotheker.firebaseUid })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(apotheker)
    orderServiceMock.createOrder.mockResolvedValue(order)

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: CREATE_ORDER_MUTATION,
        variables: {
          input: {
            lines: [{ vaccineId: '507f1f77bcf86cd799439021', quantity: 2 }],
          },
        },
      })

    const body = response.body as {
      data?: { createOrder: Order }
      errors?: Array<{ message: string }>
    }

    expect(response.status).toBe(200)
    expect(body.data?.createOrder.status).toBe(OrderStatus.PENDING)
    expect(orderServiceMock.createOrder).toHaveBeenCalledWith(
      apotheker,
      expect.objectContaining({
        lines: [{ vaccineId: '507f1f77bcf86cd799439021', quantity: 2 }],
      }),
    )
  })

  it('rejects ADMIN createOrder requests', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({ uid: admin.firebaseUid })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(admin)

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: CREATE_ORDER_MUTATION,
        variables: {
          input: {
            lines: [{ vaccineId: '507f1f77bcf86cd799439021', quantity: 1 }],
          },
        },
      })

    const body = response.body as {
      errors?: Array<{ message: string }>
    }

    expect(response.status).toBe(200)
    expect(body.errors?.[0]?.message).toContain('Forbidden')
    expect(orderServiceMock.createOrder).not.toHaveBeenCalled()
  })

  it('allows ADMIN to list all orders', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({ uid: admin.firebaseUid })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(admin)
    orderServiceMock.findOrders.mockResolvedValue([order])

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: ADMIN_ORDERS_QUERY })

    const body = response.body as {
      data?: { orders: Order[] }
    }

    expect(response.status).toBe(200)
    expect(body.data?.orders).toHaveLength(1)
  })

  it('rejects APOTHEKER access to admin orders query', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({ uid: apotheker.firebaseUid })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(apotheker)

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: ADMIN_ORDERS_QUERY })

    const body = response.body as {
      errors?: Array<{ message: string }>
    }

    expect(response.status).toBe(200)
    expect(body.errors?.[0]?.message).toContain('Forbidden')
    expect(orderServiceMock.findOrders).not.toHaveBeenCalled()
  })
})
