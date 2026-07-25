import { Field, Float, Int, ObjectType } from '@nestjs/graphql'
import { Column } from 'typeorm'

import { VaccineImageAdminOverride } from './vaccine-image-admin-override.embed'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'
import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'

/**
 * Optional embedded vaccine image metadata (zero or one per vaccine).
 * Binary bytes are never stored here — only object-storage metadata + AI summary.
 *
 * GraphQL exposes a safe subset only; storage keys and provider internals stay
 * persistence-only (no @Field). `imageUrl` is a ResolveField (not persisted).
 */
@ObjectType('VaccineImage')
export class VaccineImage {
  /** Persistence only — never expose via GraphQL. */
  @Column()
  storageProvider!: VaccineImageStorageProviderId

  /** Persistence only — never expose via GraphQL. */
  @Column()
  storageKey!: string

  @Column()
  @Field()
  originalFilename!: string

  @Column()
  @Field()
  mimeType!: string

  /** Persistence only. */
  @Column()
  sizeBytes!: number

  @Column()
  @Field(() => Int)
  width!: number

  @Column()
  @Field(() => Int)
  height!: number

  @Column()
  @Field(() => VaccineImageValidationStatus)
  validationStatus!: VaccineImageValidationStatus

  /** Persistence only. */
  @Column()
  aiProvider!: VaccineImageAiProvider

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  aiCaption?: string | null

  @Column({ nullable: true })
  @Field(() => Float, { nullable: true })
  aiConfidence?: number | null

  @Column({ default: [] })
  @Field(() => [String], { defaultValue: [] })
  aiTags!: string[]

  /** Persistence only — OCR / detected text; may be sensitive. */
  @Column({ default: [] })
  aiDetectedText!: string[]

  @Column({ nullable: true })
  @Field(() => String, { nullable: true })
  aiReason?: string | null

  @Column({ nullable: true })
  analysedAt?: Date | null

  @Column()
  @Field()
  uploadedAt!: Date

  /** Persistence only. */
  @Column()
  uploadedByUserId!: string

  /** Persistence only. */
  @Column({ nullable: true })
  adminOverride?: VaccineImageAdminOverride | null
}
