import { Field, InputType } from '@nestjs/graphql'
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator'

import {
  PUSH_DEVICE_LABEL_MAX_LENGTH,
  PUSH_ENDPOINT_MAX_LENGTH,
  PUSH_KEY_MAX_LENGTH,
  PUSH_USER_AGENT_MAX_LENGTH,
} from '../push-payload'

@InputType()
export class RegisterPushSubscriptionInput {
  @Field()
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(PUSH_ENDPOINT_MAX_LENGTH)
  @MinLength(8)
  endpoint!: string

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(PUSH_KEY_MAX_LENGTH)
  p256dh!: string

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(PUSH_KEY_MAX_LENGTH)
  auth!: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(PUSH_USER_AGENT_MAX_LENGTH)
  userAgentSummary?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(PUSH_DEVICE_LABEL_MAX_LENGTH)
  deviceLabel?: string

  @Field({ nullable: true })
  @IsOptional()
  @IsIn(['default', 'granted', 'denied', 'prompt'])
  permissionState?: string
}

@InputType()
export class DisablePushSubscriptionInput {
  @Field({ nullable: true, description: 'Endpoint to disable; omit to disable all for the actor' })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(PUSH_ENDPOINT_MAX_LENGTH)
  endpoint?: string
}
