import { MODULE_METADATA } from '@nestjs/common/constants'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { StrictIdentityThrottlerGuard } from '../common/throttling/strict-identity-throttler.guard'
import { ThrottlingModule } from '../common/throttling/throttling.module'
import { buildTypeOrmMongoOptions } from '../config/mongo-connection'
import { OrderCoreModule } from '../order/order-core.module'
import { OrderModule } from '../order/order.module'
import { OrderResolver } from '../order/order.resolver'
import { ProfileCoreModule } from '../profile/profile-core.module'
import { ProfileModule } from '../profile/profile.module'
import { RoutesCoreModule } from '../routes/routes-core.module'
import { RoutesModule } from '../routes/routes.module'
import { RoutesResolver } from '../routes/routes.resolver'
import { SettingsCoreModule } from '../settings/settings-core.module'
import { SettingsModule } from '../settings/settings.module'
import { SettingsResolver } from '../settings/settings.resolver'
import { StockCoreModule } from '../stock/stock-core.module'
import { StockModule } from '../stock/stock.module'
import { StockResolver } from '../stock/stock.resolver'
import { UserCoreModule } from '../user/user-core.module'
import { UserModule } from '../user/user.module'
import { UserResolver } from '../user/user.resolver'
import { VaccineCoreModule } from '../vaccine/vaccine-core.module'
import { VaccineModule } from '../vaccine/vaccine.module'
import { VaccineResolver } from '../vaccine/vaccine.resolver'
import { SeedModule } from './seed.module'

function moduleImports(
  metatype: abstract new (...args: never[]) => unknown,
): unknown[] {
  return (
    (Reflect.getMetadata(MODULE_METADATA.IMPORTS, metatype) as unknown[]) ?? []
  )
}

function moduleProviders(
  metatype: abstract new (...args: never[]) => unknown,
): unknown[] {
  return (
    (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, metatype) as unknown[]) ??
    []
  )
}

function flattenImportRefs(imports: unknown[]): unknown[] {
  return imports.filter(entry => typeof entry === 'function')
}

describe('Bootstrap module graph (no HTTP throttling)', () => {
  it('SeedModule imports persistence cores, not GraphQL feature modules', () => {
    const seedImports = flattenImportRefs(moduleImports(SeedModule))

    expect(seedImports).toContain(SettingsCoreModule)
    expect(seedImports).toContain(StockCoreModule)
    expect(seedImports).toContain(RoutesCoreModule)

    expect(seedImports).not.toContain(UserModule)
    expect(seedImports).not.toContain(ProfileModule)
    expect(seedImports).not.toContain(SettingsModule)
    expect(seedImports).not.toContain(VaccineModule)
    expect(seedImports).not.toContain(StockModule)
    expect(seedImports).not.toContain(OrderModule)
    expect(seedImports).not.toContain(RoutesModule)
    expect(seedImports).not.toContain(ThrottlingModule)
  })

  it('persistence cores do not register GraphQL resolvers or StrictIdentityThrottlerGuard', () => {
    const coreProviders = [
      ...moduleProviders(UserCoreModule),
      ...moduleProviders(ProfileCoreModule),
      ...moduleProviders(SettingsCoreModule),
      ...moduleProviders(VaccineCoreModule),
      ...moduleProviders(StockCoreModule),
      ...moduleProviders(OrderCoreModule),
      ...moduleProviders(RoutesCoreModule),
    ]

    expect(coreProviders).not.toContain(UserResolver)
    expect(coreProviders).not.toContain(SettingsResolver)
    expect(coreProviders).not.toContain(VaccineResolver)
    expect(coreProviders).not.toContain(StockResolver)
    expect(coreProviders).not.toContain(OrderResolver)
    expect(coreProviders).not.toContain(RoutesResolver)
    expect(coreProviders).not.toContain(StrictIdentityThrottlerGuard)
  })

  it('feature modules keep resolvers while re-exporting cores', () => {
    expect(moduleProviders(UserModule)).toContain(UserResolver)
    expect(moduleImports(UserModule)).toContain(UserCoreModule)

    expect(moduleProviders(StockModule)).toContain(StockResolver)
    expect(moduleImports(StockModule)).toContain(StockCoreModule)

    expect(moduleProviders(RoutesModule)).toContain(RoutesResolver)
    expect(moduleImports(RoutesModule)).toContain(RoutesCoreModule)
  })

  it('normal AppModule still registers ThrottlingModule', () => {
    const appModuleSource = readFileSync(
      join(__dirname, '..', 'app.module.ts'),
      'utf8',
    )
    expect(appModuleSource).toContain('ThrottlingModule')
    expect(appModuleSource).toMatch(/imports:\s*\[[\s\S]*ThrottlingModule/)
  })

  it('production API synchronize remains false', () => {
    const options = buildTypeOrmMongoOptions({
      dbHost: 'mongodb://localhost:27017',
      dbName: 'vaccin_delivery',
      synchronize: false,
    })
    expect(options.synchronize).toBe(false)

    const appModuleSource = readFileSync(
      join(__dirname, '..', 'app.module.ts'),
      'utf8',
    )
    expect(appModuleSource).toMatch(
      /synchronize:\s*nodeEnv === 'development' \|\| nodeEnv === 'test'/,
    )
    expect(appModuleSource).toContain('buildTypeOrmMongoOptions')
  })

  it('ThrottlingModule still provides StrictIdentityThrottlerGuard for the API', () => {
    const providers = moduleProviders(ThrottlingModule)
    expect(providers).toContain(StrictIdentityThrottlerGuard)
  })
})
