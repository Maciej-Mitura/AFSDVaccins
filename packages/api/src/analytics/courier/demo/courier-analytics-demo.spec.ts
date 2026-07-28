import { ObjectId } from 'mongodb'

import { OrderStatus } from '../../../order/order-status.enum'
import { RouteStatus } from '../../../routes/route-status.enum'
import { calculateCourierPerformanceAnalytics } from '../courier-analytics.calculator'
import {
  applyAnalyticsDemoPlan,
  cleanupAnalyticsDemoData,
} from './courier-analytics-demo.apply'
import {
  ANALYTICS_DEMO_PROTECTED_EMAILS,
  analyticsDemoEmail,
  analyticsDemoObjectId,
} from './courier-analytics-demo.constants'
import { createMemoryAnalyticsDemoDb } from './courier-analytics-demo.memory-db'
import { buildAnalyticsDemoPlan } from './courier-analytics-demo.plan'
import {
  ANALYTICS_DEMO_PRODUCTION_CONFIRM_PHRASE,
  assertAnalyticsDemoMutationAllowed,
} from './courier-analytics-demo.safety'

const FIXED_NOW = new Date(2026, 6, 28, 12, 0, 0)

describe('courier analytics demo data (Phase 35C)', () => {
  it('1. dry-run does not mutate', async () => {
    const db = createMemoryAnalyticsDemoDb()
    const plan = buildAnalyticsDemoPlan({ mode: 'dry-run', now: FIXED_NOW })
    const beforeWrites = db.writeCount()
    await applyAnalyticsDemoPlan(db, plan, { dryRun: true })
    expect(db.writeCount()).toBe(beforeWrites)
    expect(db.store.users).toHaveLength(0)
    expect(db.store.delivery_routes).toHaveLength(0)
  })

  it('2. apply creates expected couriers', async () => {
    const db = createMemoryAnalyticsDemoDb()
    const plan = buildAnalyticsDemoPlan({ mode: 'apply', now: FIXED_NOW })
    await applyAnalyticsDemoPlan(db, plan, { dryRun: false })

    expect(db.store.users).toHaveLength(10)
    expect(db.store.bezorger_profiles).toHaveLength(10)
    expect(db.store.users.map(u => String(u.email))).toEqual(
      Array.from({ length: 10 }, (_, i) => analyticsDemoEmail(i + 1)),
    )
    expect(db.store.bezorger_profiles.map(p => String(p.displayName))).toEqual(
      Array.from({ length: 10 }, (_, i) => `Courier Stat ${String(i + 1).padStart(2, '0')}`),
    )
    expect(plan.summary.routeCount).toBeGreaterThan(40)
    expect(plan.summary.orderCount).toBeGreaterThan(40)
    expect(db.store.delivery_routes).toHaveLength(plan.summary.routeCount)
  })

  it('3. repeat apply is idempotent', async () => {
    const db = createMemoryAnalyticsDemoDb()
    const plan = buildAnalyticsDemoPlan({ mode: 'apply', now: FIXED_NOW })
    await applyAnalyticsDemoPlan(db, plan, { dryRun: false })
    const firstUsers = db.store.users.length
    const firstRoutes = db.store.delivery_routes.length
    await applyAnalyticsDemoPlan(db, plan, { dryRun: false })
    expect(db.store.users).toHaveLength(firstUsers)
    expect(db.store.delivery_routes).toHaveLength(firstRoutes)
  })

  it('4. cleanup removes only generated records', async () => {
    const protectedUser = {
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      email: 'bezorger1@demo.be',
      firebaseUid: 'real-bezorger1',
      firstName: 'Daan',
      lastName: 'Route',
      role: 'BEZORGER',
    }
    const protectedProfile = {
      _id: new ObjectId('607f1f77bcf86cd799439022'),
      userId: protectedUser._id.toString(),
      displayName: 'Daan Route West',
      vehicleLabel: 'Van-W01',
    }
    const protectedRoute = {
      _id: new ObjectId('707f1f77bcf86cd799439033'),
      bezorgerProfileId: protectedProfile._id.toString(),
      deliveryDate: '2026-07-28',
      status: 'ASSIGNED',
      stops: [],
    }

    const db = createMemoryAnalyticsDemoDb({
      users: [protectedUser],
      bezorger_profiles: [protectedProfile],
      delivery_routes: [protectedRoute],
    })
    const plan = buildAnalyticsDemoPlan({ mode: 'apply', now: FIXED_NOW })
    await applyAnalyticsDemoPlan(db, plan, { dryRun: false })
    expect(db.store.users.length).toBeGreaterThan(1)

    await cleanupAnalyticsDemoData(db, { dryRun: false })

    expect(db.store.users).toHaveLength(1)
    expect(db.store.users[0]?.email).toBe('bezorger1@demo.be')
    expect(db.store.bezorger_profiles).toHaveLength(1)
    expect(db.store.bezorger_profiles[0]?.displayName).toBe('Daan Route West')
    expect(db.store.delivery_routes).toHaveLength(1)
    expect(String(db.store.delivery_routes[0]?._id)).toBe(
      protectedRoute._id.toString(),
    )
    expect(db.store.orders).toHaveLength(0)
    expect(db.store.route_templates).toHaveLength(0)
  })

  it('5. real demo accounts remain untouched', async () => {
    const db = createMemoryAnalyticsDemoDb()
    const plan = buildAnalyticsDemoPlan({ mode: 'apply', now: FIXED_NOW })
    await applyAnalyticsDemoPlan(db, plan, { dryRun: false })

    const emails = new Set(db.store.users.map(u => String(u.email).toLowerCase()))
    for (const protectedEmail of ANALYTICS_DEMO_PROTECTED_EMAILS) {
      expect(emails.has(protectedEmail.toLowerCase())).toBe(false)
    }
    expect(
      db.store.bezorger_profiles.some(
        p => String(p.displayName) === 'Daan Route West',
      ),
    ).toBe(false)
  })

  it('6. generated routes satisfy invariants', () => {
    const plan = buildAnalyticsDemoPlan({ mode: 'dry-run', now: FIXED_NOW })
    const keys = new Set<string>()

    for (const route of plan.routes) {
      const key = `${route.bezorgerProfileId}|${route.deliveryDate}`
      expect(keys.has(key)).toBe(false)
      keys.add(key)

      expect(['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).toContain(
        route.status,
      )
      expect(route.stops.length).toBeGreaterThan(0)

      for (const stop of route.stops) {
        expect(stop.orderIds.length).toBe(stop.orderCount)
        expect(stop.totalQuantity).toBeGreaterThan(0)
        if (route.status === RouteStatus.COMPLETED) {
          expect(stop.deliveryProof).toBeTruthy()
          expect(stop.deliveryProof?.deliveredAt).toBeInstanceOf(Date)
          expect(['QR', 'ADMIN']).toContain(stop.deliveryProof?.method)
        } else {
          expect(stop.deliveryProof == null).toBe(true)
        }
      }
    }

    expect(plan.couriers.every(c => c.template.active === false)).toBe(true)
  })

  it('7–9. analytics calculator returns meaningful leaderboard and month variation', () => {
    const plan = buildAnalyticsDemoPlan({ mode: 'dry-run', now: FIXED_NOW })
    const result = calculateCourierPerformanceAnalytics({
      routes: plan.routes.map(route => ({
        id: route._id.toString(),
        bezorgerProfileId: route.bezorgerProfileId,
        deliveryDate: route.deliveryDate,
        status: route.status,
        generatedAt: route.generatedAt,
        stops: route.stops.map(stop => ({
          stopId: stop.stopId,
          sequence: stop.sequence,
          orderIds: stop.orderIds,
          orderCount: stop.orderCount,
          totalQuantity: stop.totalQuantity,
          arrival: stop.arrival
            ? { recordedAt: stop.arrival.recordedAt }
            : null,
          deliveryProof: stop.deliveryProof
            ? {
                method: stop.deliveryProof.method,
                deliveredAt: stop.deliveryProof.deliveredAt,
                associatedOrderIds: stop.deliveryProof.associatedOrderIds,
              }
            : null,
          confirmationProcess: stop.confirmationProcess
            ? { state: stop.confirmationProcess.state }
            : null,
        })),
      })),
      couriers: plan.couriers.map(courier => ({
        courierProfileId: courier.profile._id.toString(),
        courierUserId: courier.user._id.toString(),
        displayName: courier.displayName,
        vehicleLabel: courier.profile.vehicleLabel,
      })),
      zeroRouteBezorgerProfileCount: 0,
      todayLocalDate: '2026-07-28',
      timeZone: 'Europe/Brussels',
      generatedAt: FIXED_NOW,
    })

    expect(result.courierRankings.length).toBeGreaterThanOrEqual(8)
    const scores = result.courierRankings.map(row => row.totalScore)
    expect(Math.max(...scores)).toBeGreaterThan(Math.min(...scores))
    expect(result.summary.totalCompletedRoutes).toBeGreaterThan(0)
    expect(result.monthlyActivity.length).toBeGreaterThan(1)
    const monthsWithActivity = result.monthlyActivity.filter(
      m => m.completedRoutes > 0 || m.deliveredStops > 0,
    )
    expect(monthsWithActivity.length).toBeGreaterThan(1)
  })

  it('10. order history relationships remain valid', () => {
    const plan = buildAnalyticsDemoPlan({ mode: 'dry-run', now: FIXED_NOW })
    const orderIds = new Set(plan.orders.map(order => order._id.toString()))

    for (const route of plan.routes) {
      for (const stop of route.stops) {
        for (const orderId of stop.orderIds) {
          expect(orderIds.has(orderId)).toBe(true)
        }
        if (stop.deliveryProof) {
          for (const orderId of stop.deliveryProof.associatedOrderIds) {
            expect(stop.orderIds).toContain(orderId)
            expect(orderIds.has(orderId)).toBe(true)
          }
        }
      }
    }

    for (const order of plan.orders) {
      expect(order.totalQuantity).toBeGreaterThan(0)
      expect(order.orderLines.length).toBeGreaterThan(0)
      if (order.status === OrderStatus.DELIVERED) {
        expect(order.deliveredAt).toBeInstanceOf(Date)
        expect(order.deliveryMethod).toMatch(/^(QR|ADMIN)$/)
      }
    }
  })

  it('11. no duplicate active templates', () => {
    const plan = buildAnalyticsDemoPlan({ mode: 'dry-run', now: FIXED_NOW })
    const activeByCourier = new Map<string, number>()
    for (const courier of plan.couriers) {
      expect(courier.template.active).toBe(false)
      const key = courier.profile._id.toString()
      activeByCourier.set(
        key,
        (activeByCourier.get(key) ?? 0) + (courier.template.active ? 1 : 0),
      )
    }
    for (const count of activeByCourier.values()) {
      expect(count).toBe(0)
    }
  })

  it('12. production safety guard', () => {
    expect(() =>
      assertAnalyticsDemoMutationAllowed({
        nodeEnv: 'production',
        dbName: 'vaccin-delivery',
        confirmPhrase: null,
      }),
    ).toThrow(/production-like/)

    expect(() =>
      assertAnalyticsDemoMutationAllowed({
        nodeEnv: 'development',
        dbName: 'vaccin-delivery-prod',
        confirmPhrase: '',
      }),
    ).toThrow(/production-like/)

    expect(() =>
      assertAnalyticsDemoMutationAllowed({
        nodeEnv: 'production',
        dbName: 'vaccin-delivery-prod',
        confirmPhrase: ANALYTICS_DEMO_PRODUCTION_CONFIRM_PHRASE,
      }),
    ).not.toThrow()

    expect(() =>
      assertAnalyticsDemoMutationAllowed({
        nodeEnv: 'development',
        dbName: 'vaccin-delivery',
      }),
    ).not.toThrow()
  })

  it('uses deterministic ObjectIds in the a35c00 namespace', () => {
    const userId = analyticsDemoObjectId('user', 0).toString()
    expect(userId.startsWith('a35c00')).toBe(true)
    expect(userId).toHaveLength(24)
  })
})
