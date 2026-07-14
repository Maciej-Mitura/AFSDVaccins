import { Query, Resolver } from '@nestjs/graphql'
import { HealthStatus } from './health-status.object'
import { HealthService } from './health.service'

@Resolver()
export class HealthResolver {
  constructor(private readonly healthService: HealthService) {}

  @Query(() => HealthStatus, { description: 'Public API health status' })
  health(): HealthStatus {
    return this.healthService.getStatus()
  }
}
