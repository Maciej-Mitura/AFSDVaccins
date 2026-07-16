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
import { FirebaseAuthStrategy } from '../authentication/firebase-auth.strategy'
import { FirebaseService } from '../authentication/firebase.service'
import { RolesGuard } from '../user/guards/roles.guard'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { UserService } from '../user/user.service'
import { RouteTemplatesResolver } from './route-templates.resolver'
import { RouteTemplatesService } from './route-templates.service'

const ROUTE_TEMPLATES_QUERY = `
  query RouteTemplates($includeInactive: Boolean!) {
    routeTemplates(includeInactive: $includeInactive) {
      id
      name
      active
    }
  }
`

const CREATE_ROUTE_TEMPLATE_MUTATION = `
  mutation CreateRouteTemplate($input: CreateRouteTemplateInput!) {
    createRouteTemplate(input: $input) {
      id
      name
    }
  }
`

const SET_ROUTE_TEMPLATE_ACTIVE_MUTATION = `
  mutation SetRouteTemplateActive($id: ID!, $active: Boolean!) {
    setRouteTemplateActive(id: $id, active: $active) {
      id
      active
    }
  }
`

describe('RouteTemplatesResolver (GraphQL)', () => {
  let app: INestApplication
  let server: Server

  const adminUser: User = {
    _id: '507f1f77bcf86cd799439011',
    id: '507f1f77bcf86cd799439011',
    firebaseUid: 'firebase-admin',
    email: 'admin@example.com',
    firstName: 'Ada',
    lastName: 'Admin',
    role: UserRole.ADMIN,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    updatedAt: new Date('2026-07-14T12:00:00.000Z'),
  }

  const apothekerUser: User = {
    ...adminUser,
    _id: '507f1f77bcf86cd799439012',
    id: '507f1f77bcf86cd799439012',
    firebaseUid: 'firebase-apotheker',
    email: 'apotheker@example.com',
    role: UserRole.APOTHEKER,
  }

  const bezorgerUser: User = {
    ...adminUser,
    _id: '507f1f77bcf86cd799439013',
    id: '507f1f77bcf86cd799439013',
    firebaseUid: 'firebase-bezorger',
    email: 'bezorger@example.com',
    role: UserRole.BEZORGER,
  }

  const firebaseServiceMock = {
    verifyIdToken: jest.fn(),
  }

  const userServiceMock = {
    requireByFirebaseUid: jest.fn(),
  }

  const routeTemplatesServiceMock = {
    findRouteTemplates: jest.fn(),
    findRouteTemplateById: jest.fn(),
    createRouteTemplate: jest.fn(),
    updateRouteTemplate: jest.fn(),
    setRouteTemplateActive: jest.fn(),
  }

  beforeEach(async () => {
    firebaseServiceMock.verifyIdToken.mockReset()
    userServiceMock.requireByFirebaseUid.mockReset()
    Object.values(routeTemplatesServiceMock).forEach(mock => mock.mockReset())

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule.register({ defaultStrategy: 'firebase-auth' }),
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: join(
            process.cwd(),
            'dist/schema.route-templates.test.gql',
          ),
          sortSchema: true,
          context: ({ req, res }: { req: Request; res: Response }) => ({
            req,
            res,
          }),
        }),
      ],
      providers: [
        RouteTemplatesResolver,
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
          provide: RouteTemplatesService,
          useValue: routeTemplatesServiceMock,
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

  it('rejects unauthenticated route template reads', async () => {
    const response = await request(server)
      .post('/graphql')
      .send({
        query: ROUTE_TEMPLATES_QUERY,
        variables: { includeInactive: false },
      })

    const body = response.body as {
      data?: { routeTemplates?: unknown }
      errors?: Array<{ message: string }>
    }

    expect(body.data?.routeTemplates).toBeUndefined()
    expect(body.errors?.[0]?.message).toMatch(/Unauthorized/i)
    expect(routeTemplatesServiceMock.findRouteTemplates).not.toHaveBeenCalled()
  })

  it('rejects APOTHEKER route template access', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: apothekerUser.firebaseUid,
      email: apothekerUser.email,
      email_verified: true,
    })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(apothekerUser)

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: CREATE_ROUTE_TEMPLATE_MUTATION,
        variables: {
          input: {
            name: 'Noordroute',
            bezorgerProfileId: '607f1f77bcf86cd799439022',
            stops: [{ apothekerProfileId: '707f1f77bcf86cd799439033' }],
          },
        },
      })

    const body = response.body as {
      errors?: Array<{ message: string }>
    }

    expect(body.errors?.[0]?.message).toMatch(/Forbidden/i)
    expect(routeTemplatesServiceMock.createRouteTemplate).not.toHaveBeenCalled()
  })

  it('rejects BEZORGER route template access', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: bezorgerUser.firebaseUid,
      email: bezorgerUser.email,
      email_verified: true,
    })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(bezorgerUser)

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: ROUTE_TEMPLATES_QUERY,
        variables: { includeInactive: true },
      })

    const body = response.body as {
      errors?: Array<{ message: string }>
    }

    expect(body.errors?.[0]?.message).toMatch(/Forbidden/i)
    expect(routeTemplatesServiceMock.findRouteTemplates).not.toHaveBeenCalled()
  })

  it('allows ADMIN to list and mutate route templates', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: adminUser.firebaseUid,
      email: adminUser.email,
      email_verified: true,
    })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(adminUser)
    routeTemplatesServiceMock.findRouteTemplates.mockResolvedValue([
      {
        id: '507f1f77bcf86cd799439011',
        name: 'Noordroute',
        active: true,
      },
    ])
    routeTemplatesServiceMock.setRouteTemplateActive.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      active: false,
    })

    const listResponse = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: ROUTE_TEMPLATES_QUERY,
        variables: { includeInactive: false },
      })

    const listBody = listResponse.body as {
      data?: { routeTemplates: Array<{ name: string }> }
      errors?: Array<{ message: string }>
    }

    expect(listBody.errors).toBeUndefined()
    expect(listBody.data?.routeTemplates[0]?.name).toBe('Noordroute')
    expect(routeTemplatesServiceMock.findRouteTemplates).toHaveBeenCalledWith(
      false,
    )

    const mutateResponse = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: SET_ROUTE_TEMPLATE_ACTIVE_MUTATION,
        variables: {
          id: '507f1f77bcf86cd799439011',
          active: false,
        },
      })

    const mutateBody = mutateResponse.body as {
      data?: { setRouteTemplateActive: { active: boolean } }
      errors?: Array<{ message: string }>
    }

    expect(mutateBody.errors).toBeUndefined()
    expect(mutateBody.data?.setRouteTemplateActive.active).toBe(false)
    expect(routeTemplatesServiceMock.setRouteTemplateActive).toHaveBeenCalled()
  })
})
