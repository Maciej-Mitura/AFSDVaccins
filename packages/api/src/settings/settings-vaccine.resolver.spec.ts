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
import { SettingsResolver } from '../settings/settings.resolver'
import { SettingsService } from '../settings/settings.service'
import { RolesGuard } from '../user/guards/roles.guard'
import { UserRole } from '../user/user-role.enum'
import { User } from '../user/user.entity'
import { UserService } from '../user/user.service'
import { VaccineResolver } from '../vaccine/vaccine.resolver'
import { VaccineService } from '../vaccine/vaccine.service'

const APPLICATION_SETTINGS_QUERY = `
  query ApplicationSettings {
    applicationSettings {
      id
      timezone
      orderingClosingTime
      weeklyWarningPercentage
    }
  }
`

const UPDATE_APPLICATION_SETTINGS_MUTATION = `
  mutation UpdateApplicationSettings($input: UpdateApplicationSettingsInput!) {
    updateApplicationSettings(input: $input) {
      orderingClosingTime
      weeklyWarningPercentage
    }
  }
`

const VACCINES_QUERY = `
  query Vaccines($includeInactive: Boolean!) {
    vaccines(includeInactive: $includeInactive) {
      id
      name
      active
    }
  }
`

const CREATE_VACCINE_MUTATION = `
  mutation CreateVaccine($input: CreateVaccineInput!) {
    createVaccine(input: $input) {
      id
      name
    }
  }
`

describe('Settings and Vaccine resolvers (GraphQL)', () => {
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

  const firebaseServiceMock = {
    verifyIdToken: jest.fn(),
  }

  const userServiceMock = {
    requireByFirebaseUid: jest.fn(),
  }

  const settingsServiceMock = {
    getApplicationSettings: jest.fn(),
    updateApplicationSettings: jest.fn(),
  }

  const vaccineServiceMock = {
    findVaccines: jest.fn(),
    createVaccine: jest.fn(),
  }

  beforeEach(async () => {
    firebaseServiceMock.verifyIdToken.mockReset()
    userServiceMock.requireByFirebaseUid.mockReset()
    settingsServiceMock.getApplicationSettings.mockReset()
    settingsServiceMock.updateApplicationSettings.mockReset()
    vaccineServiceMock.findVaccines.mockReset()
    vaccineServiceMock.createVaccine.mockReset()

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule.register({ defaultStrategy: 'firebase-auth' }),
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: join(
            process.cwd(),
            'dist/schema.settings-vaccine.test.gql',
          ),
          sortSchema: true,
          context: ({ req, res }: { req: Request; res: Response }) => ({
            req,
            res,
          }),
        }),
      ],
      providers: [
        SettingsResolver,
        VaccineResolver,
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
          provide: SettingsService,
          useValue: settingsServiceMock,
        },
        {
          provide: VaccineService,
          useValue: vaccineServiceMock,
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

  it('rejects unauthenticated settings reads', async () => {
    const response = await request(server)
      .post('/graphql')
      .send({ query: APPLICATION_SETTINGS_QUERY })

    const body = response.body as {
      data?: { applicationSettings?: unknown }
      errors?: Array<{ message: string }>
    }

    expect(body.data?.applicationSettings).toBeUndefined()
    expect(body.errors?.[0]?.message).toMatch(/Unauthorized/i)
  })

  it('allows authenticated users to read settings', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: apothekerUser.firebaseUid,
      email: apothekerUser.email,
      email_verified: true,
    })
    settingsServiceMock.getApplicationSettings.mockResolvedValue({
      id: 'settings-id',
      timezone: 'Europe/Brussels',
      orderingClosingTime: '14:00',
      weeklyWarningPercentage: 90,
    })

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: APPLICATION_SETTINGS_QUERY })

    const body = response.body as {
      data?: {
        applicationSettings: {
          timezone: string
        }
      }
      errors?: Array<{ message: string }>
    }

    expect(body.errors).toBeUndefined()
    expect(body.data?.applicationSettings.timezone).toBe('Europe/Brussels')
  })

  it('blocks non-admin settings updates', async () => {
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
        query: UPDATE_APPLICATION_SETTINGS_MUTATION,
        variables: {
          input: {
            weeklyWarningPercentage: 85,
          },
        },
      })

    const body = response.body as {
      errors?: Array<{ message: string }>
    }

    expect(body.errors?.[0]?.message).toMatch(/Forbidden/i)
    expect(settingsServiceMock.updateApplicationSettings).not.toHaveBeenCalled()
  })

  it('allows ADMIN to update settings', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: adminUser.firebaseUid,
      email: adminUser.email,
      email_verified: true,
    })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(adminUser)
    settingsServiceMock.updateApplicationSettings.mockResolvedValue({
      orderingClosingTime: '15:00',
      weeklyWarningPercentage: 85,
    })

    const response = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: UPDATE_APPLICATION_SETTINGS_MUTATION,
        variables: {
          input: {
            weeklyWarningPercentage: 85,
          },
        },
      })

    const body = response.body as {
      data?: {
        updateApplicationSettings: {
          weeklyWarningPercentage: number
        }
      }
      errors?: Array<{ message: string }>
    }

    expect(body.errors).toBeUndefined()
    expect(body.data?.updateApplicationSettings.weeklyWarningPercentage).toBe(
      85,
    )
  })

  it('allows APOTHEKER to read vaccines but not create them', async () => {
    firebaseServiceMock.verifyIdToken.mockResolvedValue({
      uid: apothekerUser.firebaseUid,
      email: apothekerUser.email,
      email_verified: true,
    })
    userServiceMock.requireByFirebaseUid.mockResolvedValue(apothekerUser)
    vaccineServiceMock.findVaccines.mockResolvedValue([
      { id: 'v1', name: 'Influenza', active: true },
    ])

    const readResponse = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: VACCINES_QUERY,
        variables: { includeInactive: false },
      })

    const readBody = readResponse.body as {
      data?: { vaccines: Array<{ name: string }> }
      errors?: Array<{ message: string }>
    }

    expect(readBody.errors).toBeUndefined()
    expect(readBody.data?.vaccines[0]?.name).toBe('Influenza')

    const createResponse = await request(server)
      .post('/graphql')
      .set('Authorization', 'Bearer valid-token')
      .send({
        query: CREATE_VACCINE_MUTATION,
        variables: {
          input: {
            name: 'New Vaccine',
            manufacturer: 'PharmaCo',
          },
        },
      })

    const createBody = createResponse.body as {
      errors?: Array<{ message: string }>
    }

    expect(createBody.errors?.[0]?.message).toMatch(/Forbidden/i)
    expect(vaccineServiceMock.createVaccine).not.toHaveBeenCalled()
  })
})
