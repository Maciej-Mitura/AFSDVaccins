import { Test, TestingModule } from '@nestjs/testing'
import { HealthResolver } from './health.resolver'
import { HealthService } from './health.service'
import { HealthStatus } from './health-status.object'

describe('HealthResolver', () => {
  let resolver: HealthResolver

  const mockStatus: HealthStatus = {
    status: 'ok',
    service: 'vaccin-delivery-api',
    timestamp: '2026-07-14T12:00:00.000Z',
    environment: 'test',
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthResolver,
        {
          provide: HealthService,
          useValue: {
            getStatus: jest.fn().mockReturnValue(mockStatus),
          },
        },
      ],
    }).compile()

    resolver = module.get(HealthResolver)
  })

  it('returns health status from the service', () => {
    expect(resolver.health()).toEqual(mockStatus)
  })
})
