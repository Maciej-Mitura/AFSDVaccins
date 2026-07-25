import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import type { EnvConfig } from '../../config/env.validation'
import {
  DELIVERY_QR_RANDOM_SOURCE,
  DELIVERY_QR_SIGNING_SECRET_MIN_LENGTH,
  DELIVERY_QR_TEST_SIGNING_SECRET,
  DELIVERY_QR_TOKEN_SERVICE,
} from './delivery-qr.constants'
import { DeliveryQrSigningConfigurationException } from './delivery-qr.exceptions'
import { systemDeliveryQrRandomSource } from './delivery-qr-nonce.util'
import { HmacDeliveryQrTokenService } from './hmac-delivery-qr-token.service'
import type { DeliveryQrTokenService } from './delivery-qr-token.types'

function resolveSigningSecret(
  configService: ConfigService<EnvConfig, true>,
): string {
  const configured = configService.get('DELIVERY_QR_SIGNING_SECRET', {
    infer: true,
  })
  const nodeEnv = configService.get('NODE_ENV', { infer: true })

  if (
    typeof configured === 'string' &&
    configured.length >= DELIVERY_QR_SIGNING_SECRET_MIN_LENGTH
  ) {
    return configured
  }

  // Explicit test-only gate — never a silent production/development fallback.
  if (nodeEnv === 'test' && !configured) {
    return DELIVERY_QR_TEST_SIGNING_SECRET
  }

  throw new DeliveryQrSigningConfigurationException(
    `DELIVERY_QR_SIGNING_SECRET is required (min ${DELIVERY_QR_SIGNING_SECRET_MIN_LENGTH} characters) outside explicit test injection.`,
  )
}

const isSchemaGeneration =
  process.argv.includes('--generate-schema-only') ||
  process.env.GENERATE_SCHEMA_ONLY === 'true'

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DELIVERY_QR_RANDOM_SOURCE,
      useValue: systemDeliveryQrRandomSource,
    },
    {
      provide: DELIVERY_QR_TOKEN_SERVICE,
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<EnvConfig, true>,
      ): DeliveryQrTokenService => {
        if (isSchemaGeneration) {
          return new HmacDeliveryQrTokenService(DELIVERY_QR_TEST_SIGNING_SECRET)
        }

        return new HmacDeliveryQrTokenService(resolveSigningSecret(configService))
      },
    },
  ],
  exports: [DELIVERY_QR_TOKEN_SERVICE, DELIVERY_QR_RANDOM_SOURCE],
})
export class DeliveryQrModule {}
