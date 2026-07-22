import {
  assertSafeE2eDatabaseName,
  isSafeE2eDatabaseName,
  UnsafeE2eDatabaseError,
} from './helpers/e2e-database.safety'
import {
  createE2eTestApp,
  type E2eTestApp,
} from './helpers/e2e-app.factory'
import { countCollection } from './helpers/e2e-collections'
import {
  getLiveFirebaseCallCount,
  resetLiveFirebaseCallCount,
  E2E_TOKENS,
} from './helpers/e2e-firebase.override'
import { E2eFixtureBuilder } from './helpers/e2e-fixtures'
import { User } from '../src/user/user.entity'
import { UserRole } from '../src/user/user-role.enum'

describe('E2E infrastructure', () => {
  describe('database safety', () => {
    it('accepts names containing _test or e2e', () => {
      expect(isSafeE2eDatabaseName('vaccin_delivery_e2e_test')).toBe(true)
      expect(isSafeE2eDatabaseName('orders_e2e')).toBe(true)
      expect(isSafeE2eDatabaseName('my_test_db')).toBe(true)
    })

    it('rejects unsafe database names', () => {
      expect(isSafeE2eDatabaseName('vaccin-delivery')).toBe(false)
      expect(isSafeE2eDatabaseName('production')).toBe(false)
      expect(() => assertSafeE2eDatabaseName('vaccin-delivery')).toThrow(
        UnsafeE2eDatabaseError,
      )
    })
  })

  describe('test application lifecycle', () => {
    let harness: E2eTestApp | undefined

    afterEach(async () => {
      if (harness) {
        await harness.close()
        harness = undefined
      }
    })

    it('boots against an isolated memory database and closes cleanly', async () => {
      harness = await createE2eTestApp()
      expect(harness.dbName).toContain('e2e')
      assertSafeE2eDatabaseName(harness.dbName)

      const fixtures = new E2eFixtureBuilder(harness.dataSource)
      await fixtures.createUser({
        firebaseUid: 'infra-user',
        email: 'infra@example.com',
        firstName: 'Infra',
        lastName: 'User',
        role: UserRole.ADMIN,
      })

      expect(await countCollection(harness.dataSource, User)).toBe(1)

      await harness.resetDatabase()
      expect(await countCollection(harness.dataSource, User)).toBe(0)
    })

    it('keeps auth token mappings isolated from live Firebase', async () => {
      resetLiveFirebaseCallCount()
      harness = await createE2eTestApp()

      expect(E2E_TOKENS.admin).toBe('e2e-admin')
      expect(getLiveFirebaseCallCount()).toBe(0)

      await harness.close()
      harness = undefined
      expect(getLiveFirebaseCallCount()).toBe(0)
    })
  })
})
