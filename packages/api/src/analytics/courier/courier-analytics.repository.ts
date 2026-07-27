import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { BezorgerProfile } from '../../profile/bezorger/bezorger-profile.entity'
import { DeliveryRoute } from '../../routes/delivery-route.entity'
import {
  COURIER_ANALYTICS_MAX_COURIERS,
  COURIER_ANALYTICS_MAX_ROUTES,
} from './courier-analytics.constants'
import { CourierAnalyticsTooLargeException } from './courier-analytics.exceptions'
import type {
  AnalyticsCourierIdentity,
  AnalyticsRouteInput,
} from './courier-analytics.types'

export type CourierAnalyticsRawDataset = {
  routes: AnalyticsRouteInput[]
  couriers: AnalyticsCourierIdentity[]
  zeroRouteBezorgerProfileCount: number
}

/**
 * Loads bounded operational data for courier analytics.
 * Prefers correctness over a monolithic Mongo aggregation pipeline.
 */
@Injectable()
export class CourierAnalyticsRepository {
  constructor(
    @InjectRepository(DeliveryRoute)
    private readonly routeRepository: MongoRepository<DeliveryRoute>,
    @InjectRepository(BezorgerProfile)
    private readonly bezorgerProfileRepository: MongoRepository<BezorgerProfile>,
  ) {}

  async loadAllTimeDataset(): Promise<CourierAnalyticsRawDataset> {
    const routeCount = await this.routeRepository.count()
    if (routeCount > COURIER_ANALYTICS_MAX_ROUTES) {
      throw new CourierAnalyticsTooLargeException()
    }

    const profileCount = await this.bezorgerProfileRepository.count()
    if (profileCount > COURIER_ANALYTICS_MAX_COURIERS) {
      throw new CourierAnalyticsTooLargeException()
    }

    const routes = await this.routeRepository.find()
    const profiles = await this.bezorgerProfileRepository.find()

    const identityByProfileId = new Map<string, AnalyticsCourierIdentity>()
    for (const profile of profiles) {
      const profileId = String(profile._id)
      identityByProfileId.set(profileId, {
        courierProfileId: profileId,
        courierUserId: String(profile.userId),
        displayName: profile.displayName,
        vehicleLabel: profile.vehicleLabel ?? null,
      })
    }

    const mappedRoutes: AnalyticsRouteInput[] = routes.map((route) => ({
      id: String(route._id),
      bezorgerProfileId: String(route.bezorgerProfileId),
      deliveryDate: String(route.deliveryDate ?? ''),
      status: String(route.status ?? ''),
      generatedAt: route.generatedAt ?? null,
      stops: Array.isArray(route.stops)
        ? route.stops.map((stop) => ({
            stopId: stop.stopId ?? null,
            sequence: stop.sequence ?? null,
            orderIds: stop.orderIds ?? null,
            orderCount: stop.orderCount ?? null,
            totalQuantity: stop.totalQuantity ?? null,
            arrival: stop.arrival
              ? { recordedAt: stop.arrival.recordedAt ?? null }
              : null,
            deliveryProof: stop.deliveryProof
              ? {
                  method: stop.deliveryProof.method ?? null,
                  deliveredAt: stop.deliveryProof.deliveredAt ?? null,
                  associatedOrderIds:
                    stop.deliveryProof.associatedOrderIds ?? null,
                }
              : null,
            confirmationProcess: stop.confirmationProcess
              ? { state: stop.confirmationProcess.state ?? null }
              : null,
          }))
        : [],
    }))

    const assignedProfileIds = new Set(
      mappedRoutes.map((route) => route.bezorgerProfileId).filter(Boolean),
    )

    const couriers: AnalyticsCourierIdentity[] = []
    for (const profileId of assignedProfileIds) {
      const known = identityByProfileId.get(profileId)
      if (known) {
        couriers.push(known)
      } else {
        couriers.push({
          courierProfileId: profileId,
          courierUserId: '',
          displayName: `Courier ${profileId}`,
          vehicleLabel: null,
        })
      }
    }

    let zeroRouteBezorgerProfileCount = 0
    for (const profileId of identityByProfileId.keys()) {
      if (!assignedProfileIds.has(profileId)) {
        zeroRouteBezorgerProfileCount += 1
      }
    }

    return {
      routes: mappedRoutes,
      couriers,
      zeroRouteBezorgerProfileCount,
    }
  }
}
