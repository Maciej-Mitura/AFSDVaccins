import { CacheKeys } from './cache/cache-keys'
import { resolveThrottleTracker } from './throttling/throttle-tracker'
import {
  createMaxDepthRule,
  GRAPHQL_COMPLEXITY_EXCEEDED_CODE,
  GRAPHQL_DEPTH_EXCEEDED_CODE,
  buildGraphqlQueryProtectionRules,
} from './graphql/query-protection'
import {
  buildSchema,
  GraphQLError,
  parse,
  validate,
  getIntrospectionQuery,
} from 'graphql'
import {
  createComplexityRule,
  getComplexity,
  simpleEstimator,
} from 'graphql-query-complexity'

describe('CacheKeys', () => {
  it('builds deterministic cache keys', () => {
    expect(CacheKeys.settingsCurrent()).toBe('settings:current')
    expect(CacheKeys.vaccinesActive()).toBe('vaccines:active')
    expect(CacheKeys.vaccinesAll()).toBe('vaccines:all')
    expect(CacheKeys.settingsCurrent()).toBe(CacheKeys.settingsCurrent())
  })
})

describe('resolveThrottleTracker', () => {
  it('prefers application user id over firebase uid and ip', () => {
    const result = resolveThrottleTracker({
      applicationUser: { _id: 'app-1' },
      user: { uid: 'fb-1' },
      ip: '1.2.3.4',
    })
    expect(result).toEqual({
      tracker: 'app:app-1',
      source: 'application-user',
    })
  })

  it('falls back to firebase uid when application user is absent', () => {
    const result = resolveThrottleTracker({
      user: { uid: 'fb-42' },
      ip: '1.2.3.4',
    })
    expect(result).toEqual({
      tracker: 'fb:fb-42',
      source: 'firebase-uid',
    })
  })

  it('falls back to ip for anonymous callers', () => {
    const result = resolveThrottleTracker({ ip: '10.0.0.9' })
    expect(result).toEqual({
      tracker: 'ip:10.0.0.9',
      source: 'ip',
    })
  })

  it('keeps authenticated callers on separate stable keys', () => {
    const a = resolveThrottleTracker({
      applicationUser: { _id: 'user-a' },
      ip: '1.1.1.1',
    })
    const b = resolveThrottleTracker({
      applicationUser: { _id: 'user-b' },
      ip: '1.1.1.1',
    })
    expect(a.tracker).not.toBe(b.tracker)
    expect(a.tracker).toBe('app:user-a')
    expect(b.tracker).toBe('app:user-b')
  })

  it('does not trust a client-supplied user id field', () => {
    const forged: Record<string, unknown> = {
      body: { userId: 'forged' },
      headers: { 'x-user-id': 'forged' },
      ip: '9.9.9.9',
    }
    const result = resolveThrottleTracker(forged)
    expect(result.tracker).toBe('ip:9.9.9.9')
  })
})

describe('GraphQL query protection', () => {
  const schema = buildSchema(`
    type Query {
      health: String
      deliveryRoutes: [DeliveryRoute!]!
    }
    type DeliveryRoute {
      id: ID!
      stops: [RouteStop!]!
      statusHistory: [RouteStatusChange!]!
    }
    type RouteStop {
      sequence: Int!
      address: Address!
      lines: [RouteLine!]!
    }
    type Address {
      street: String!
      city: String!
    }
    type RouteLine {
      vaccineName: String!
      quantity: Int!
    }
    type RouteStatusChange {
      toStatus: String!
      changedAt: String!
    }
  `)

  const representativeDeliveryRoutes = `
    query DeliveryRoutes {
      deliveryRoutes {
        id
        stops {
          sequence
          address { street city }
          lines { vaccineName quantity }
        }
        statusHistory { toStatus changedAt }
      }
    }
  `

  it('accepts a representative largest PWA-like query', () => {
    const rules = buildGraphqlQueryProtectionRules({
      maxDepth: 12,
      maxComplexity: 500,
    })
    const errors = validate(schema, parse(representativeDeliveryRoutes), rules)
    expect(errors).toEqual([])
  })

  it('reports measured complexity for representative operations', () => {
    const complexity = getComplexity({
      estimators: [
        (args) => {
          if (args.field.name.startsWith('__')) {
            return 0
          }
          return simpleEstimator({ defaultComplexity: 1 })(args)
        },
      ],
      schema,
      query: parse(representativeDeliveryRoutes),
    })
    // deliveryRoutes + id + stops + sequence + address + street + city + lines
    // + vaccineName + quantity + statusHistory + toStatus + changedAt = 13
    expect(complexity).toBe(13)
    expect(complexity).toBeLessThan(500)
  })

  it('rejects excessive nested depth with a stable code', () => {
    const deep = parse(`
      query {
        deliveryRoutes {
          stops {
            address {
              street
            }
          }
        }
      }
    `)
    // depth: deliveryRoutes(1) stops(2) address(3) street(4) — limit 3
    const errors = validate(schema, deep, [createMaxDepthRule(3)])
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.extensions?.code).toBe(GRAPHQL_DEPTH_EXCEEDED_CODE)
  })

  it('handles fragments when measuring depth', () => {
    const withFragment = parse(`
      fragment Addr on Address { street city }
      query {
        deliveryRoutes {
          stops {
            address { ...Addr }
          }
        }
      }
    `)
    expect(validate(schema, withFragment, [createMaxDepthRule(12)])).toEqual([])
    expect(validate(schema, withFragment, [createMaxDepthRule(2)]).length).toBeGreaterThan(
      0,
    )
  })

  it('rejects excessive aliases / repeated fields by complexity', () => {
    const aliases = parse(`
      query {
        a1: deliveryRoutes { id }
        a2: deliveryRoutes { id }
        a3: deliveryRoutes { id }
        a4: deliveryRoutes { id }
        a5: deliveryRoutes { id }
      }
    `)
    const rule = createComplexityRule({
      maximumComplexity: 8,
      estimators: [simpleEstimator({ defaultComplexity: 1 })],
      createError: (max, actual) =>
        new GraphQLError(
          `Query exceeds maximum complexity of ${max} (actual ${actual}).`,
          { extensions: { code: GRAPHQL_COMPLEXITY_EXCEEDED_CODE } },
        ),
    })
    const errors = validate(schema, aliases, [rule])
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.extensions?.code).toBe(GRAPHQL_COMPLEXITY_EXCEEDED_CODE)
  })

  it('does not reject introspection under configured limits', () => {
    const rules = buildGraphqlQueryProtectionRules({
      maxDepth: 12,
      maxComplexity: 500,
    })
    const errors = validate(schema, parse(getIntrospectionQuery()), rules)
    // Introspection fields cost 0 / are ignored for depth; may still have nesting
    // through non-__ fields in some schemas — our schema has none required.
    expect(
      errors.filter((e) => e.extensions?.code === GRAPHQL_DEPTH_EXCEEDED_CODE),
    ).toEqual([])
  })
})
