import { ObjectId } from 'mongodb'

import {
  applyAnalyticsDemoPlan,
  cleanupAnalyticsDemoData,
  type AnalyticsDemoDb,
} from './courier-analytics-demo.apply'

type Doc = Record<string, unknown> & { _id: ObjectId | string }

function idString(value: unknown): string {
  if (value instanceof ObjectId) {
    return value.toString()
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value == null) {
    return ''
  }
  throw new Error('Unsupported id value')
}

function asRegexSource(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof RegExp) {
    return value.source
  }
  throw new Error('Expected regex source string')
}

function asRegexFlags(value: unknown): string | undefined {
  if (value == null) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  throw new Error('Expected regex flags string')
}

function matchesFilter(doc: Doc, filter: Record<string, unknown>): boolean {
  if (filter.$or && Array.isArray(filter.$or)) {
    return (filter.$or as Array<Record<string, unknown>>).some(part =>
      matchesFilter(doc, part),
    )
  }

  for (const [key, raw] of Object.entries(filter)) {
    if (key === '$or') {
      continue
    }
    const value = doc[key]

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const ops = raw as Record<string, unknown>
      if (ops.$in && Array.isArray(ops.$in)) {
        const set = new Set(ops.$in.map(item => idString(item)))
        if (!set.has(idString(value))) {
          return false
        }
        continue
      }
      if (ops.$regex) {
        const regex = new RegExp(
          asRegexSource(ops.$regex),
          asRegexFlags(ops.$options),
        )
        if (!regex.test(idString(value))) {
          return false
        }
        continue
      }
      if (ops.$gte || ops.$lt) {
        const hex = idString(value)
        if (ops.$gte && hex < idString(ops.$gte)) {
          return false
        }
        if (ops.$lt && hex >= idString(ops.$lt)) {
          return false
        }
        continue
      }
    }

    if (idString(value) !== idString(raw)) {
      return false
    }
  }
  return true
}

/**
 * Minimal in-memory Mongo stand-in for unit tests.
 */
export function createMemoryAnalyticsDemoDb(
  seed: Partial<Record<string, Doc[]>> = {},
): AnalyticsDemoDb & {
  store: Record<string, Doc[]>
  writeCount: () => number
} {
  const store: Record<string, Doc[]> = {
    users: [...(seed.users ?? [])],
    bezorger_profiles: [...(seed.bezorger_profiles ?? [])],
    route_templates: [...(seed.route_templates ?? [])],
    delivery_routes: [...(seed.delivery_routes ?? [])],
    orders: [...(seed.orders ?? [])],
  }
  let writes = 0

  return {
    store,
    writeCount: () => writes,
    collection: (name: string) => {
      if (!store[name]) {
        store[name] = []
      }

      return {
        find: (filter: Record<string, unknown>) => ({
          toArray: () =>
            Promise.resolve(
              (store[name] ?? [])
                .filter(doc => matchesFilter(doc, filter))
                .map(doc => ({ ...doc })),
            ),
        }),
        deleteMany: (filter: Record<string, unknown>) => {
          const current = store[name] ?? []
          const before = current.length
          store[name] = current.filter(doc => !matchesFilter(doc, filter))
          const deletedCount = before - (store[name] ?? []).length
          if (deletedCount > 0) {
            writes += 1
          }
          return Promise.resolve({ deletedCount })
        },
        bulkWrite: operations => {
          let upsertedCount = 0
          let modifiedCount = 0
          for (const operation of operations) {
            const replaceOne = operation.replaceOne as
              | {
                  filter: { _id: ObjectId }
                  replacement: Doc
                  upsert?: boolean
                }
              | undefined
            if (!replaceOne) {
              continue
            }
            writes += 1
            const current = store[name] ?? []
            const index = current.findIndex(
              doc => idString(doc._id) === idString(replaceOne.filter._id),
            )
            if (index >= 0) {
              current[index] = { ...replaceOne.replacement }
              modifiedCount += 1
            } else if (replaceOne.upsert) {
              current.push({ ...replaceOne.replacement })
              upsertedCount += 1
            }
            store[name] = current
          }
          return Promise.resolve({ upsertedCount, modifiedCount })
        },
      }
    },
  }
}

export { applyAnalyticsDemoPlan, cleanupAnalyticsDemoData }
