import {
  buildTypeOrmMongoOptions,
  isMongoNamespaceNotFound,
  safeMongoScheme,
} from './mongo-connection'
import { buildMongoUrl } from './env.validation'

describe('buildTypeOrmMongoOptions', () => {
  it('passes DB_NAME into TypeORM database option for production', () => {
    const options = buildTypeOrmMongoOptions({
      dbHost: 'mongodb+srv://user:pass@cluster0.example.mongodb.net/',
      dbName: 'vaccin_delivery',
      synchronize: false,
    })

    expect(options.type).toBe('mongodb')
    expect(options.database).toBe('vaccin_delivery')
    expect(options.synchronize).toBe(false)
    expect(options.autoLoadEntities).toBe(true)
    expect(options.url).toContain('/vaccin_delivery')
    expect(options.database).not.toBe('test')
  })

  it('selects DB_NAME for an Atlas URI with query params and no database path', () => {
    const dbHost =
      'mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true&w=majority'
    const dbName = 'vaccin_delivery'

    const options = buildTypeOrmMongoOptions({
      dbHost,
      dbName,
      synchronize: false,
    })

    const parsed = new URL(options.url)
    expect(parsed.pathname).toBe('/vaccin_delivery')
    expect(parsed.searchParams.get('retryWrites')).toBe('true')
    expect(options.database).toBe('vaccin_delivery')
    expect(options.url).not.toMatch(/\/test(\?|$)/)
    expect(options.database).not.toBe('test')
  })

  it('does not silently fall back to test when DB_NAME is set', () => {
    const options = buildTypeOrmMongoOptions({
      dbHost: 'mongodb+srv://u:p@cluster.example.mongodb.net/?w=majority',
      dbName: 'vaccin_delivery',
      synchronize: false,
    })

    expect(options.database).toBe('vaccin_delivery')
    expect(new URL(options.url).pathname).toBe('/vaccin_delivery')
    expect(options.database).not.toBe('test')
  })

  it('keeps production synchronize false', () => {
    const options = buildTypeOrmMongoOptions({
      dbHost: 'mongodb://localhost:27017',
      dbName: 'vaccin_delivery',
      synchronize: false,
    })

    expect(options.synchronize).toBe(false)
  })

  it('bootstrap path uses DB_NAME with synchronize true', () => {
    const options = buildTypeOrmMongoOptions({
      dbHost:
        'mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true&w=majority',
      dbName: 'vaccin_delivery',
      synchronize: true,
    })

    expect(options.database).toBe('vaccin_delivery')
    expect(options.synchronize).toBe(true)
    expect(new URL(options.url).pathname).toBe('/vaccin_delivery')
  })

  it('rejects missing DB_HOST or DB_NAME', () => {
    expect(() =>
      buildTypeOrmMongoOptions({
        dbHost: '',
        dbName: 'vaccin_delivery',
        synchronize: false,
      }),
    ).toThrow(/DB_HOST, DB_NAME/)

    expect(() =>
      buildTypeOrmMongoOptions({
        dbHost: 'mongodb://localhost:27017',
        dbName: '',
        synchronize: false,
      }),
    ).toThrow(/DB_HOST, DB_NAME/)
  })
})

describe('safeMongoScheme', () => {
  it('reports scheme without credentials or full URI', () => {
    expect(safeMongoScheme('mongodb://localhost:27017')).toBe('mongodb')
    expect(
      safeMongoScheme(
        'mongodb+srv://user:secret@cluster0.example.mongodb.net/?retryWrites=true',
      ),
    ).toBe('mongodb+srv')
    expect(safeMongoScheme('postgres://localhost')).toBe('unknown')
  })
})

describe('isMongoNamespaceNotFound', () => {
  it('recognizes code 26 and NamespaceNotFound codeName', () => {
    expect(isMongoNamespaceNotFound({ code: 26 })).toBe(true)
    expect(isMongoNamespaceNotFound({ codeName: 'NamespaceNotFound' })).toBe(
      true,
    )
    expect(
      isMongoNamespaceNotFound({ code: 26, codeName: 'NamespaceNotFound' }),
    ).toBe(true)
  })

  it('does not treat auth, duplicate-key, or unrelated errors as missing NS', () => {
    expect(isMongoNamespaceNotFound({ code: 13, codeName: 'Unauthorized' })).toBe(
      false,
    )
    expect(
      isMongoNamespaceNotFound({ code: 11000, codeName: 'DuplicateKey' }),
    ).toBe(false)
    expect(
      isMongoNamespaceNotFound(new Error('ns does not exist: test.stock_adjustments')),
    ).toBe(false)
    expect(isMongoNamespaceNotFound(null)).toBe(false)
  })
})

describe('buildMongoUrl Atlas path insertion', () => {
  it('replaces an existing path segment with DB_NAME', () => {
    expect(
      buildMongoUrl(
        'mongodb+srv://user:pass@cluster0.example.mongodb.net/test',
        'vaccin_delivery',
      ),
    ).toBe(
      'mongodb+srv://user:pass@cluster0.example.mongodb.net/vaccin_delivery',
    )
  })
})
