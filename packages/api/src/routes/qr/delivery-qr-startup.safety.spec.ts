import { RouteGenerationService } from '../route-generation.service'
import { DeliveryQrModule } from './delivery-qr.module'
import { RoutesCoreModule } from '../routes-core.module'

describe('Phase 26A startup / bootstrap safety', () => {
  it('does not register OnModuleInit backfill on route generation or QR module', () => {
    expect(
      Reflect.getMetadata('onModuleInit', RouteGenerationService.prototype),
    ).toBeUndefined()
    expect(RouteGenerationService.prototype).not.toHaveProperty('onModuleInit')
    expect(DeliveryQrModule.prototype).not.toHaveProperty('onModuleInit')
    expect(RoutesCoreModule.prototype).not.toHaveProperty('onModuleInit')
  })
})
