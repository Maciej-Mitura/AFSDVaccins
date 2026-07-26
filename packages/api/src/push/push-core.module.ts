import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { EnvConfig } from '../config/env.validation'
import { NotificationsCoreModule } from '../notifications/notifications-core.module'
import { CLOCK, SystemClock } from '../order/clock.provider'
import { FakePushNotificationProvider } from './fake-push-notification.provider'
import { NotificationDeliveryPolicyService } from './notification-delivery-policy.service'
import { PUSH_NOTIFICATION_PROVIDER } from './push-notification.provider'
import {
  assertWebPushSecrets,
  resolvePushProviderMode,
} from './push-provider.selection'
import { PushSubscriptionEntity } from './push-subscription.entity'
import { PushSubscriptionService } from './push-subscription.service'
import { WebPushNotificationProvider } from './web-push-notification.provider'

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

const pushProvider = {
  provide: PUSH_NOTIFICATION_PROVIDER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<EnvConfig, true>) => {
    if (isSchemaGeneration) {
      return new FakePushNotificationProvider()
    }

    const nodeEnv = configService.get('NODE_ENV', { infer: true })
    const mode = resolvePushProviderMode(
      configService.get('PUSH_PROVIDER', { infer: true }),
      nodeEnv,
    )

    if (mode === 'fake') {
      return new FakePushNotificationProvider()
    }

    const publicKey = configService.get('WEB_PUSH_VAPID_PUBLIC_KEY', {
      infer: true,
    })
    const privateKey = configService.get('WEB_PUSH_VAPID_PRIVATE_KEY', {
      infer: true,
    })
    const subject = configService.get('WEB_PUSH_SUBJECT', { infer: true })

    assertWebPushSecrets(publicKey, privateKey, subject)

    return WebPushNotificationProvider.fromConfig({
      vapidPublicKey: publicKey,
      vapidPrivateKey: privateKey!,
      subject: subject!,
    })
  },
}

const persistenceImports = isSchemaGeneration
  ? []
  : [TypeOrmModule.forFeature([PushSubscriptionEntity])]

const pushSubscriptionServiceProvider = isSchemaGeneration
  ? {
      provide: PushSubscriptionService,
      useValue: {
        registerSubscription: () =>
          Promise.resolve({
            enabled: false,
            subscriptionCount: 0,
            provider: 'fake',
            vapidPublicKey: null,
            permissionGuidance: null,
          }),
        disableSubscription: () =>
          Promise.resolve({
            enabled: false,
            subscriptionCount: 0,
            provider: 'fake',
            vapidPublicKey: null,
            permissionGuidance: null,
          }),
        getCapabilityStatus: () =>
          Promise.resolve({
            enabled: false,
            subscriptionCount: 0,
            provider: 'fake',
            vapidPublicKey: null,
            permissionGuidance: null,
          }),
        findActiveSubscriptionsForUser: () => Promise.resolve([]),
        applyPushResult: () => Promise.resolve(),
      },
    }
  : PushSubscriptionService

/**
 * Push delivery policy + subscription persistence without GraphQL resolvers
 * or UserModule (safe for Seed/Bootstrap CLI graphs).
 */
@Module({
  imports: [
    ConfigModule,
    NotificationsCoreModule,
    ...persistenceImports,
  ],
  providers: [
    pushProvider,
    pushSubscriptionServiceProvider,
    NotificationDeliveryPolicyService,
    {
      provide: CLOCK,
      useClass: SystemClock,
    },
  ],
  exports: [
    PUSH_NOTIFICATION_PROVIDER,
    PushSubscriptionService,
    NotificationDeliveryPolicyService,
    ...persistenceImports,
  ],
})
export class PushCoreModule {}
