import { ObjectId } from 'mongodb'

import {
  ANALYTICS_DEMO_DISPLAY_NAME_PATTERN,
  ANALYTICS_DEMO_EMAIL_PATTERN,
  ANALYTICS_DEMO_OBJECT_ID_PREFIX,
  ANALYTICS_DEMO_TEMPLATE_NAME_PATTERN,
  isProtectedPresentationEmail,
} from './courier-analytics-demo.constants'
import type { AnalyticsDemoPlan } from './courier-analytics-demo.plan'

function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value instanceof ObjectId) {
    return value.toString()
  }
  if (value == null) {
    return ''
  }
  throw new Error('Expected string-compatible field value')
}

export type AnalyticsDemoCollection = {
  find: (filter: Record<string, unknown>) => {
    toArray: () => Promise<Array<Record<string, unknown>>>
  }
  deleteMany: (
    filter: Record<string, unknown>,
  ) => Promise<{ deletedCount: number }>
  bulkWrite: (
    operations: Array<Record<string, unknown>>,
    options?: { ordered?: boolean },
  ) => Promise<{ upsertedCount: number; modifiedCount: number }>
}

export type AnalyticsDemoDb = {
  collection: (name: string) => AnalyticsDemoCollection
}

export type AnalyticsDemoApplyResult = {
  usersUpserted: number
  profilesUpserted: number
  templatesUpserted: number
  routesUpserted: number
  ordersUpserted: number
}

export type AnalyticsDemoCleanupResult = {
  usersDeleted: number
  profilesDeleted: number
  templatesDeleted: number
  routesDeleted: number
  ordersDeleted: number
}

function objectIdFilter(ids: ObjectId[]): { _id: { $in: ObjectId[] } } {
  return { _id: { $in: ids } }
}

/**
 * Upsert only analytics-demo-tagged documents. Never touches presentation emails.
 */
export async function applyAnalyticsDemoPlan(
  db: AnalyticsDemoDb,
  plan: AnalyticsDemoPlan,
  options: {
    dryRun: boolean
    extraProtectedEmails?: readonly string[]
  },
): Promise<AnalyticsDemoApplyResult> {
  for (const courier of plan.couriers) {
    if (
      isProtectedPresentationEmail(
        courier.email,
        options.extraProtectedEmails ?? [],
      )
    ) {
      throw new Error(
        `Refusing to upsert protected presentation account: ${courier.email}`,
      )
    }
  }

  const result: AnalyticsDemoApplyResult = {
    usersUpserted: plan.couriers.length,
    profilesUpserted: plan.couriers.length,
    templatesUpserted: plan.couriers.length,
    routesUpserted: plan.routes.length,
    ordersUpserted: plan.orders.length,
  }

  if (options.dryRun) {
    return result
  }

  const users = db.collection('users')
  const profiles = db.collection('bezorger_profiles')
  const templates = db.collection('route_templates')
  const routes = db.collection('delivery_routes')
  const orders = db.collection('orders')

  await users.bulkWrite(
    plan.couriers.map(courier => ({
      replaceOne: {
        filter: { _id: courier.user._id },
        replacement: courier.user,
        upsert: true,
      },
    })),
    { ordered: false },
  )

  await profiles.bulkWrite(
    plan.couriers.map(courier => ({
      replaceOne: {
        filter: { _id: courier.profile._id },
        replacement: courier.profile,
        upsert: true,
      },
    })),
    { ordered: false },
  )

  await templates.bulkWrite(
    plan.couriers.map(courier => ({
      replaceOne: {
        filter: { _id: courier.template._id },
        replacement: courier.template,
        upsert: true,
      },
    })),
    { ordered: false },
  )

  if (plan.routes.length > 0) {
    await routes.bulkWrite(
      plan.routes.map(route => ({
        replaceOne: {
          filter: { _id: route._id },
          replacement: route,
          upsert: true,
        },
      })),
      { ordered: false },
    )
  }

  if (plan.orders.length > 0) {
    await orders.bulkWrite(
      plan.orders.map(order => ({
        replaceOne: {
          filter: { _id: order._id },
          replacement: order,
          upsert: true,
        },
      })),
      { ordered: false },
    )
  }

  return result
}

/**
 * Delete only documents created by this script (email / name / ObjectId prefix).
 * Presentation accounts are explicitly protected.
 */
export async function cleanupAnalyticsDemoData(
  db: AnalyticsDemoDb,
  options: {
    dryRun: boolean
    extraProtectedEmails?: readonly string[]
  },
): Promise<AnalyticsDemoCleanupResult> {
  const usersCol = db.collection('users')
  const profilesCol = db.collection('bezorger_profiles')
  const templatesCol = db.collection('route_templates')
  const routesCol = db.collection('delivery_routes')
  const ordersCol = db.collection('orders')

  const demoUsers = await usersCol
    .find({
      email: { $regex: '^courier-stat-\\d{2}@demo\\.be$', $options: 'i' },
    })
    .toArray()

  for (const user of demoUsers) {
    const email = asString(user.email)
    if (
      isProtectedPresentationEmail(email, options.extraProtectedEmails ?? [])
    ) {
      throw new Error(
        `Cleanup aborted: matched protected email unexpectedly: ${email}`,
      )
    }
    if (!ANALYTICS_DEMO_EMAIL_PATTERN.test(email)) {
      throw new Error(`Cleanup aborted: unexpected email match: ${email}`)
    }
  }

  const userIds = demoUsers.map(user => asString(user._id))
  const demoProfiles = await profilesCol
    .find({
      $or: [
        { userId: { $in: userIds } },
        { displayName: { $regex: '^Courier Stat \\d{2}$' } },
      ],
    })
    .toArray()

  for (const profile of demoProfiles) {
    const displayName = asString(profile.displayName)
    if (
      displayName &&
      !ANALYTICS_DEMO_DISPLAY_NAME_PATTERN.test(displayName) &&
      !userIds.includes(asString(profile.userId))
    ) {
      throw new Error(
        `Cleanup aborted: unexpected profile displayName: ${displayName}`,
      )
    }
  }

  const profileIds = demoProfiles.map(profile => asString(profile._id))

  const demoTemplates = await templatesCol
    .find({
      $or: [
        { bezorgerProfileId: { $in: profileIds } },
        { name: { $regex: '^Analytics Demo Route Stat \\d{2}$' } },
      ],
    })
    .toArray()

  for (const template of demoTemplates) {
    const name = asString(template.name)
    if (name && !ANALYTICS_DEMO_TEMPLATE_NAME_PATTERN.test(name)) {
      // Allow templates tied by profile id even if renamed; still ours.
      if (!profileIds.includes(asString(template.bezorgerProfileId))) {
        throw new Error(`Cleanup aborted: unexpected template name: ${name}`)
      }
    }
  }

  const demoRoutes = await routesCol
    .find({
      $or: [
        { bezorgerProfileId: { $in: profileIds } },
        {
          _id: {
            $gte: new ObjectId(`${ANALYTICS_DEMO_OBJECT_ID_PREFIX}030000000000000000`),
            $lt: new ObjectId(`${ANALYTICS_DEMO_OBJECT_ID_PREFIX}040000000000000000`),
          },
        },
      ],
    })
    .toArray()

  const demoOrders = await ordersCol
    .find({
      _id: {
        $gte: new ObjectId(`${ANALYTICS_DEMO_OBJECT_ID_PREFIX}040000000000000000`),
        $lt: new ObjectId(`${ANALYTICS_DEMO_OBJECT_ID_PREFIX}050000000000000000`),
      },
    })
    .toArray()

  const result: AnalyticsDemoCleanupResult = {
    usersDeleted: demoUsers.length,
    profilesDeleted: demoProfiles.length,
    templatesDeleted: demoTemplates.length,
    routesDeleted: demoRoutes.length,
    ordersDeleted: demoOrders.length,
  }

  if (options.dryRun) {
    return result
  }

  if (demoUsers.length > 0) {
    await usersCol.deleteMany(
      objectIdFilter(demoUsers.map(doc => new ObjectId(String(doc._id)))),
    )
  }
  if (demoProfiles.length > 0) {
    await profilesCol.deleteMany(
      objectIdFilter(demoProfiles.map(doc => new ObjectId(String(doc._id)))),
    )
  }
  if (demoTemplates.length > 0) {
    await templatesCol.deleteMany(
      objectIdFilter(demoTemplates.map(doc => new ObjectId(String(doc._id)))),
    )
  }
  if (demoRoutes.length > 0) {
    await routesCol.deleteMany(
      objectIdFilter(demoRoutes.map(doc => new ObjectId(String(doc._id)))),
    )
  }
  if (demoOrders.length > 0) {
    await ordersCol.deleteMany(
      objectIdFilter(demoOrders.map(doc => new ObjectId(String(doc._id)))),
    )
  }

  return result
}
