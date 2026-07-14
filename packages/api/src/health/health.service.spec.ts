import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { HealthService } from './health.service'

describe('HealthService', () => {
  let service: HealthService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test'),
          },
        },
      ],
    }).compile()

    service = module.get(HealthService)
  })

  it('returns a healthy status payload without secrets', () => {
    const status = service.getStatus()

    expect(status.status).toBe('ok')
    expect(status.service).toBe('vaccin-delivery-api')
    expect(status.environment).toBe('test')
    expect(status.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(status).not.toHaveProperty('password')
    expect(status).not.toHaveProperty('DB_HOST')
  })
})
