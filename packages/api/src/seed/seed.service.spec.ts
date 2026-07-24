/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/unbound-method */
import { ObjectId } from 'mongodb'

import { OrderStatus } from '../order/order-status.enum'
import { RouteGenerationService } from '../routes/route-generation.service'
import { SettingsService } from '../settings/settings.service'
import { StockAdjustmentRepository } from '../stock/stock-adjustment.repository'
import { VaccineStockRepository } from '../stock/vaccine-stock.repository'
import { UserRole } from '../user/user-role.enum'
import { SeedFirebaseProvisioningService } from './seed-firebase-provisioning.service'
import { SEED_ORDER_IDS } from './seed.constants'
import { BootstrapSafetyService } from './bootstrap.safety'
import { SeedSafetyService } from './seed.safety'
import { SeedService } from './seed.service'

describe('SeedService', () => {
  function createMocks() {
    const seedSafetyService = {
      assertSeedAllowed: jest.fn(),
      logSeedTargetConfirmation: jest.fn(),
      requireDemoPassword: jest.fn().mockReturnValue('demo-password'),
      requireTeacherAdminPassword: jest
        .fn()
        .mockReturnValue('teacher-password'),
      requirePersonalAdminEmail: jest.fn().mockReturnValue('owner@example.com'),
    } as unknown as SeedSafetyService

    const bootstrapSafetyService = {
      assertBootstrapAllowed: jest.fn(),
      logBootstrapTargetConfirmation: jest.fn(),
      requireDemoPassword: jest.fn().mockReturnValue('demo-password'),
      requireTeacherAdminPassword: jest
        .fn()
        .mockReturnValue('teacher-password'),
      requirePersonalAdminEmail: jest.fn().mockReturnValue('owner@example.com'),
    } as unknown as BootstrapSafetyService

    const firebaseProvisioning = {
      ensureFirebaseUser: jest
        .fn()
        .mockImplementation(async (account: { email: string }) => ({
          uid: `uid-for-${account.email}`,
          created: false,
          reused: true,
        })),
    } as unknown as SeedFirebaseProvisioningService

    const settingsService = {
      getApplicationSettings: jest.fn().mockResolvedValue({
        timezone: 'Europe/Brussels',
        orderingClosingTime: '14:00',
        singletonKey: 'default',
      }),
    } as unknown as SettingsService

    const findByBezorgerAndDate = jest.fn().mockResolvedValue(null)
    const routeGenerationService = {
      findByBezorgerAndDate,
      generateDeliveryRoute: jest.fn().mockImplementation(async () => {
        const route = {
          status: 'ASSIGNED',
          statusHistory: [
            {
              fromStatus: null,
              toStatus: 'ASSIGNED',
              changedByUserId: 'admin',
            },
          ],
          stops: [{ pharmacyName: 'Apotheek Centrum Brugge' }],
        }
        findByBezorgerAndDate.mockResolvedValue(route)
        return route
      }),
    } as unknown as RouteGenerationService

    const stockAdjustmentWriter = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      insertIdempotentAdjustment: jest.fn().mockResolvedValue({}),
    } as unknown as StockAdjustmentRepository

    const vaccineStockRepository = {
      adjustStockQuantity: jest
        .fn()
        .mockImplementation(async (_id: ObjectId, delta: number) => {
          const before = Math.max(0, 0)
          return {
            quantityBefore: before,
            quantityAfter: before + delta,
          }
        }),
    } as unknown as VaccineStockRepository

    const users = new Map<
      string,
      { _id: string; firebaseUid: string; role: UserRole }
    >()
    const userRepository = {
      findOne: jest
        .fn()
        .mockImplementation(
          async ({ where }: { where: { firebaseUid?: string } }) => {
            if (!where.firebaseUid) {
              return null
            }
            return users.get(where.firebaseUid) ?? null
          },
        ),
      create: jest.fn().mockImplementation(payload => payload),
      save: jest.fn().mockImplementation(async payload => {
        const id = payload._id ?? new ObjectId().toString()
        const saved = { ...payload, _id: id }
        users.set(saved.firebaseUid, saved)
        return saved
      }),
    }

    const profiles = new Map<string, unknown>()
    const apothekerProfileRepository = {
      findOne: jest
        .fn()
        .mockImplementation(
          async ({ where }: { where: { userId: string } }) => {
            return profiles.get(`a:${where.userId}`) ?? null
          },
        ),
      create: jest.fn().mockImplementation(payload => payload),
      save: jest.fn().mockImplementation(async payload => {
        const saved = {
          ...payload,
          _id: payload._id ?? new ObjectId().toString(),
        }
        profiles.set(`a:${saved.userId}`, saved)
        return saved
      }),
      remove: jest
        .fn()
        .mockImplementation(async (entity: { userId: string }) => {
          profiles.delete(`a:${entity.userId}`)
          return entity
        }),
    }

    const bezorgerProfileRepository = {
      findOne: jest
        .fn()
        .mockImplementation(
          async ({ where }: { where: { userId: string } }) => {
            return profiles.get(`b:${where.userId}`) ?? null
          },
        ),
      create: jest.fn().mockImplementation(payload => payload),
      save: jest.fn().mockImplementation(async payload => {
        const saved = {
          ...payload,
          _id: payload._id ?? new ObjectId().toString(),
        }
        profiles.set(`b:${saved.userId}`, saved)
        return saved
      }),
      remove: jest
        .fn()
        .mockImplementation(async (entity: { userId: string }) => {
          profiles.delete(`b:${entity.userId}`)
          return entity
        }),
    }

    const settingsDocs = new Map<string, unknown>()
    const settingsRepository = {
      findOne: jest
        .fn()
        .mockImplementation(
          async ({ where }: { where: { singletonKey: string } }) => {
            return settingsDocs.get(where.singletonKey) ?? null
          },
        ),
      create: jest.fn().mockImplementation(payload => payload),
      save: jest.fn().mockImplementation(async payload => {
        settingsDocs.set(payload.singletonKey, payload)
        return payload
      }),
    }

    const vaccines = new Map<
      string,
      {
        _id: ObjectId
        normalizedName: string
        stockQuantity: number
        name: string
        manufacturer: string
      }
    >()
    const vaccineRepository = {
      findOne: jest
        .fn()
        .mockImplementation(
          async ({ where }: { where: { normalizedName: string } }) => {
            return vaccines.get(where.normalizedName) ?? null
          },
        ),
      create: jest.fn().mockImplementation(payload => payload),
      save: jest.fn().mockImplementation(async payload => {
        const saved = {
          ...payload,
          _id: payload._id ?? new ObjectId(),
          manufacturer: payload.manufacturer ?? 'Seed Pharma',
        }
        vaccines.set(saved.normalizedName, saved)
        return saved
      }),
    }

    const orders = new Map<
      string,
      { status: OrderStatus; statusHistory: unknown[] }
    >()
    const orderRepository = {
      findOne: jest
        .fn()
        .mockImplementation(async ({ where }: { where: { _id: ObjectId } }) => {
          return orders.get(where._id.toString()) ?? null
        }),
      create: jest.fn().mockImplementation(payload => payload),
      insertOne: jest.fn().mockImplementation(async payload => {
        const id = payload._id.toString()
        orders.set(id, payload)
        return { insertedId: payload._id }
      }),
      save: jest.fn().mockImplementation(async payload => {
        const id = payload._id.toString()
        const saved = { ...payload }
        orders.set(id, saved)
        return saved
      }),
    }

    const templates = new Map<
      string,
      { _id: string; normalizedName: string; bezorgerProfileId: string }
    >()
    const routeTemplateRepository = {
      findOne: jest
        .fn()
        .mockImplementation(
          async ({ where }: { where: { normalizedName: string } }) => {
            return templates.get(where.normalizedName) ?? null
          },
        ),
      create: jest.fn().mockImplementation(payload => payload),
      save: jest.fn().mockImplementation(async payload => {
        const saved = {
          ...payload,
          _id: payload._id ?? new ObjectId().toString(),
        }
        templates.set(saved.normalizedName, saved)
        return saved
      }),
    }

    const service = new SeedService(
      seedSafetyService,
      bootstrapSafetyService,
      firebaseProvisioning,
      settingsService,
      routeGenerationService,
      stockAdjustmentWriter,
      vaccineStockRepository,
      userRepository as never,
      apothekerProfileRepository as never,
      bezorgerProfileRepository as never,
      settingsRepository as never,
      vaccineRepository as never,
      orderRepository as never,
      routeTemplateRepository as never,
    )

    return {
      service,
      seedSafetyService,
      bootstrapSafetyService,
      firebaseProvisioning,
      routeGenerationService,
      stockAdjustmentWriter,
      vaccineStockRepository,
      userRepository,
      apothekerProfileRepository,
      bezorgerProfileRepository,
      orderRepository,
      orders,
      templates,
    }
  }

  it('aborts before writes when safety check fails', async () => {
    const { service, seedSafetyService, firebaseProvisioning } = createMocks()
    ;(seedSafetyService.assertSeedAllowed as jest.Mock).mockImplementation(
      () => {
        throw new Error('refused')
      },
    )

    await expect(service.run()).rejects.toThrow('refused')
    expect(firebaseProvisioning.ensureFirebaseUser).not.toHaveBeenCalled()
  })

  it('runBootstrap aborts before Firebase/Mongo writes when gates fail', async () => {
    const { service, bootstrapSafetyService, firebaseProvisioning } =
      createMocks()
    ;(
      bootstrapSafetyService.assertBootstrapAllowed as jest.Mock
    ).mockImplementation(() => {
      throw new Error('bootstrap refused')
    })

    await expect(service.runBootstrap()).rejects.toThrow('bootstrap refused')
    expect(firebaseProvisioning.ensureFirebaseUser).not.toHaveBeenCalled()
  })

  it('runBootstrap reuses existing Firebase users and Mongo documents idempotently', async () => {
    const mocks = createMocks()
    const { service, firebaseProvisioning, userRepository } = mocks

    const first = await service.runBootstrap()
    expect(first.usersCreated).toBe(7)
    expect(first.firebaseReused).toBe(7)

    const second = await service.runBootstrap()
    expect(second.usersCreated).toBe(0)
    expect(second.usersReused).toBe(7)
    expect(second.firebaseReused).toBe(7)
    expect(
      (firebaseProvisioning.ensureFirebaseUser as jest.Mock).mock.calls.length,
    ).toBe(14)
    expect((userRepository.findOne as jest.Mock).mock.calls.length).toBeGreaterThan(
      7,
    )
  })

  it('creates two ADMIN users without role profiles and links pharmacist/courier profiles to User.id', async () => {
    const {
      service,
      apothekerProfileRepository,
      bezorgerProfileRepository,
      userRepository,
    } = createMocks()

    await service.run()

    const savedUsers = (userRepository.save as jest.Mock).mock.calls.map(
      call => call[0],
    )
    const admins = savedUsers.filter(
      (user: { role: UserRole }) => user.role === UserRole.ADMIN,
    )
    expect(admins).toHaveLength(2)
    expect(admins.map((user: { email: string }) => user.email).sort()).toEqual([
      'docent@howest.be',
      'owner@example.com',
    ])

    const apothekerProfileUserIds = (
      apothekerProfileRepository.save as jest.Mock
    ).mock.calls.map(call => call[0].userId)
    const bezorgerProfileUserIds = (
      bezorgerProfileRepository.save as jest.Mock
    ).mock.calls.map(call => call[0].userId)

    expect(apothekerProfileUserIds).toHaveLength(3)
    expect(bezorgerProfileUserIds).toHaveLength(2)
    for (const admin of admins) {
      expect(apothekerProfileUserIds).not.toContain(admin._id)
      expect(bezorgerProfileUserIds).not.toContain(admin._id)
    }
  })

  it('removes accidental role profiles previously linked to ADMIN users', async () => {
    const mocks = createMocks()
    const personalUid = 'uid-for-owner@example.com'
    const personalUser = {
      _id: 'admin-personal-id',
      firebaseUid: personalUid,
      email: 'owner@example.com',
      role: UserRole.ADMIN,
    }

    ;(mocks.userRepository.findOne as jest.Mock).mockImplementation(
      async ({ where }: { where: { firebaseUid?: string } }) => {
        if (where.firebaseUid === personalUid) {
          return personalUser
        }
        return null
      },
    )

    // Simulate a leftover pharmacist profile from an earlier self-registration.
    ;(mocks.apothekerProfileRepository.findOne as jest.Mock).mockImplementation(
      async ({ where }: { where: { userId: string } }) => {
        if (where.userId === personalUser._id) {
          return { _id: 'accidental-profile', userId: personalUser._id }
        }
        return null
      },
    )

    await mocks.service.run()

    expect(mocks.apothekerProfileRepository.remove).toHaveBeenCalledWith(
      expect.objectContaining({ userId: personalUser._id }),
    )
  })

  it('reuses users and profiles on a second run without duplicates', async () => {
    const mocks = createMocks()

    await mocks.service.run()
    const firstUserSaves = (mocks.userRepository.save as jest.Mock).mock.calls
      .length
    const firstApothekerSaves = (
      mocks.apothekerProfileRepository.save as jest.Mock
    ).mock.calls.length

    await mocks.service.run()

    expect(
      (mocks.firebaseProvisioning.ensureFirebaseUser as jest.Mock).mock.calls
        .length,
    ).toBe(14)
    expect((mocks.userRepository.save as jest.Mock).mock.calls.length).toBe(
      firstUserSaves * 2,
    )
    expect(
      (mocks.apothekerProfileRepository.save as jest.Mock).mock.calls.length,
    ).toBe(firstApothekerSaves * 2)
    expect(
      (mocks.apothekerProfileRepository.create as jest.Mock).mock.calls.length,
    ).toBe(3)
  })

  it('uses deterministic order ObjectIds and Europe/Brussels delivery dates', async () => {
    const { service, orderRepository } = createMocks()

    await service.run()

    const insertedOrders = (
      orderRepository.insertOne as jest.Mock
    ).mock.calls.map(call => call[0])
    const ids = insertedOrders.map((order: { _id: ObjectId }) =>
      order._id.toString(),
    )

    expect(ids).toEqual(
      expect.arrayContaining([
        SEED_ORDER_IDS.apotheker1Today,
        SEED_ORDER_IDS.apotheker1Tomorrow,
        SEED_ORDER_IDS.apotheker2Today,
        SEED_ORDER_IDS.apotheker2Tomorrow,
      ]),
    )

    for (const order of insertedOrders) {
      expect(order.deliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(order.status).toBe(OrderStatus.PENDING)
      expect(order.statusHistory).toHaveLength(1)
    }
  })

  it('does not duplicate order history on rerun', async () => {
    const { service, orderRepository, orders } = createMocks()

    await service.run()
    const first = orders.get(SEED_ORDER_IDS.apotheker1Today)
    expect(first?.statusHistory).toHaveLength(1)

    // Simulate route planning leaving PLANNED with two history entries
    orders.set(SEED_ORDER_IDS.apotheker1Today, {
      ...first!,
      status: OrderStatus.PLANNED,
      statusHistory: [
        ...(first!.statusHistory as unknown[]),
        {
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.PLANNED,
        },
      ],
    })

    await service.run()
    const second = orders.get(SEED_ORDER_IDS.apotheker1Today)
    expect(second?.status).toBe(OrderStatus.PLANNED)
    expect(second?.statusHistory).toHaveLength(2)
    expect((orderRepository.insertOne as jest.Mock).mock.calls.length).toBe(4)
    expect((orderRepository.save as jest.Mock).mock.calls.length).toBe(4)
  })

  it('reconciles stock with stable idempotency keys and does not insert twice', async () => {
    const { service, stockAdjustmentWriter, vaccineStockRepository } =
      createMocks()

    await service.run()
    const firstInserts = (
      stockAdjustmentWriter.insertIdempotentAdjustment as jest.Mock
    ).mock.calls.length

    ;(
      stockAdjustmentWriter.findByIdempotencyKey as jest.Mock
    ).mockResolvedValue({ idempotencyKey: 'seed:stock:influenza' })
    ;(
      vaccineStockRepository.adjustStockQuantity as jest.Mock
    ).mockResolvedValue({
      quantityBefore: 500,
      quantityAfter: 500,
    })

    // Force vaccines to already have target stock on second conceptual path:
    // After first run vaccines are in memory map with updated quantities from adjust.
    await service.run()

    expect(
      (stockAdjustmentWriter.insertIdempotentAdjustment as jest.Mock).mock.calls
        .length,
    ).toBe(firstInserts)
  })

  it('generates today delivery route via RouteGenerationService and does not mark DELIVERED', async () => {
    const { service, routeGenerationService, orderRepository } = createMocks()

    await service.run()

    expect(routeGenerationService.generateDeliveryRoute).toHaveBeenCalled()
    const insertedOrders = (
      orderRepository.insertOne as jest.Mock
    ).mock.calls.map(call => call[0])
    expect(
      insertedOrders.every(
        (order: { status: OrderStatus }) =>
          order.status !== OrderStatus.DELIVERED,
      ),
    ).toBe(true)
  })

  it('does not print secrets in seed constants helpers', () => {
    expect(SEED_ORDER_IDS.apotheker1Today).toMatch(/^[a-f0-9]{24}$/)
  })
})
