import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HealthStatus } from './health-status.object'
import { EnvConfig } from '../config/env.validation'

@Injectable()
export class HealthService {
  private static readonly SERVICE_NAME = 'vaccin-delivery-api'

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  getStatus(): HealthStatus {
    return {
      status: 'ok',
      service: HealthService.SERVICE_NAME,
      timestamp: new Date().toISOString(),
      environment: this.configService.get('NODE_ENV', { infer: true }),
    }
  }
}
