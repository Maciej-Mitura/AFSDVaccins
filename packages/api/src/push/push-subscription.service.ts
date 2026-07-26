import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { EnvConfig } from '../config/env.validation'
import { CLOCK } from '../order/clock.provider'
import type { Clock } from '../order/clock.provider'
import { User } from '../user/user.entity'
import {
  DisablePushSubscriptionInput,
  RegisterPushSubscriptionInput,
} from './dto/push-subscription.input'
import {
  PushCapabilityStatus,
  PushSubscriptionEntity,
} from './push-subscription.entity'
import { hashPushEndpoint } from './push-payload'
import {
  PUSH_NOTIFICATION_PROVIDER,
  type PushNotificationProvider,
  type PushSendResult,
} from './push-notification.provider'
import { resolvePushProviderMode } from './push-provider.selection'

@Injectable()
export class PushSubscriptionService {
  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private readonly subscriptionRepository: MongoRepository<PushSubscriptionEntity>,
    @Inject(PUSH_NOTIFICATION_PROVIDER)
    private readonly pushProvider: PushNotificationProvider,
    private readonly configService: ConfigService<EnvConfig, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Idempotent register/update for the authenticated actor only.
   * Never trusts a client-supplied userId.
   */
  async registerSubscription(
    user: User,
    input: RegisterPushSubscriptionInput,
  ): Promise<PushCapabilityStatus> {
    const endpoint = input.endpoint.trim()
    const endpointHash = hashPushEndpoint(endpoint)
    const userId = user._id.toString()
    const now = this.clock.now()

    const existing = await this.subscriptionRepository.findOne({
      where: { userId, endpointHash },
    })

    if (existing) {
      existing.endpoint = endpoint
      existing.p256dh = input.p256dh
      existing.auth = input.auth
      existing.userAgentSummary = input.userAgentSummary?.slice(0, 160) ?? null
      existing.deviceLabel = input.deviceLabel?.slice(0, 64) ?? null
      existing.permissionState = input.permissionState ?? 'granted'
      existing.disabledAt = null
      existing.failureCount = 0
      existing.updatedAt = now
      await this.subscriptionRepository.save(existing)
    } else {
      const created = this.subscriptionRepository.create({
        userId,
        endpointHash,
        endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgentSummary: input.userAgentSummary?.slice(0, 160) ?? null,
        deviceLabel: input.deviceLabel?.slice(0, 64) ?? null,
        permissionState: input.permissionState ?? 'granted',
        failureCount: 0,
        disabledAt: null,
        lastSuccessfulPushAt: null,
        lastFailureAt: null,
      })
      await this.subscriptionRepository.save(created)
    }

    return this.getCapabilityStatus(user)
  }

  /**
   * Idempotent disable for the actor's own subscription(s).
   */
  async disableSubscription(
    user: User,
    input: DisablePushSubscriptionInput,
  ): Promise<PushCapabilityStatus> {
    const userId = user._id.toString()
    const now = this.clock.now()

    if (input.endpoint) {
      const endpointHash = hashPushEndpoint(input.endpoint.trim())
      const existing = await this.subscriptionRepository.findOne({
        where: { userId, endpointHash },
      })

      if (existing && !existing.disabledAt) {
        existing.disabledAt = now
        existing.updatedAt = now
        await this.subscriptionRepository.save(existing)
      }
    } else {
      const active = await this.subscriptionRepository.find({
        where: { userId, disabledAt: null },
      })

      for (const sub of active) {
        sub.disabledAt = now
        sub.updatedAt = now
        await this.subscriptionRepository.save(sub)
      }
    }

    return this.getCapabilityStatus(user)
  }

  async getCapabilityStatus(user: User): Promise<PushCapabilityStatus> {
    const userId = user._id.toString()
    const active = await this.subscriptionRepository.count({
      where: { userId, disabledAt: null },
    })

    const nodeEnv = this.configService.get('NODE_ENV', { infer: true })
    const mode = resolvePushProviderMode(
      this.configService.get('PUSH_PROVIDER', { infer: true }),
      nodeEnv,
    )

    const vapidPublicKey =
      mode === 'webpush'
        ? (this.configService.get('WEB_PUSH_VAPID_PUBLIC_KEY', {
            infer: true,
          }) ?? null)
        : null

    return {
      enabled: active > 0,
      subscriptionCount: active,
      provider: this.pushProvider.providerName,
      vapidPublicKey,
      permissionGuidance:
        active === 0
          ? 'Enable notifications from settings or the post-login prompt after an explicit click.'
          : null,
    }
  }

  async findActiveSubscriptionsForUser(
    userId: string,
  ): Promise<PushSubscriptionEntity[]> {
    return this.subscriptionRepository.find({
      where: { userId, disabledAt: null },
    })
  }

  async applyPushResult(
    subscription: PushSubscriptionEntity,
    result: PushSendResult,
  ): Promise<void> {
    const now = this.clock.now()

    if (result.ok) {
      subscription.lastSuccessfulPushAt = now
      subscription.lastFailureAt = null
      subscription.failureCount = 0
      subscription.updatedAt = now
      await this.subscriptionRepository.save(subscription)
      return
    }

    subscription.lastFailureAt = now
    subscription.failureCount = (subscription.failureCount ?? 0) + 1
    subscription.updatedAt = now

    if (result.failureKind === 'permanent') {
      subscription.disabledAt = now
    }

    await this.subscriptionRepository.save(subscription)
  }
}
