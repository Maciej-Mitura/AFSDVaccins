import { Controller, Get } from '@nestjs/common'
import { HealthStatus } from './health-status.object'
import { HealthService } from './health.service'

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  getHealth(): HealthStatus {
    return this.healthService.getStatus()
  }
}
