import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { ObjectId } from 'mongodb'
import { MongoRepository } from 'typeorm'

import { ApplicationCacheService } from '../../common/cache/application-cache.service'
import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { EnvConfig } from '../../config/env.validation'
import { User } from '../../user/user.entity'
import { VaccineNotFoundException } from '../exceptions/vaccine.exceptions'
import { Vaccine } from '../vaccine.entity'
import { analysisLabelNames } from './vaccine-image-analysis.provider'
import { VaccineImageAnalysisService } from './vaccine-image-analysis.service'
import {
  VACCINE_IMAGE_ANALYSIS_MAX_CAPTION_LENGTH,
  VACCINE_IMAGE_ANALYSIS_MAX_DETECTED_TEXT,
  VACCINE_IMAGE_ANALYSIS_MAX_REASON_LENGTH,
  VACCINE_IMAGE_ANALYSIS_MAX_TAGS,
  VACCINE_IMAGE_ANALYSIS_MAX_TEXT_LINE_LENGTH,
  boundStringArray,
  truncateText,
} from './vaccine-image-analysis.bounds'
import { VaccineImageAiProvider } from './vaccine-image-ai-provider.enum'
import { VaccineImageAuditEventType } from './vaccine-image-audit.entity'
import { VaccineImageAuditService } from './vaccine-image-audit.service'
import {
  generateVaccineImageStorageKey,
  validateVaccineImageUpload,
} from './vaccine-image-file.validation'
import { VaccineImageOverrideDecision } from './vaccine-image-override-decision.enum'
import {
  toVaccineImageSafeDto,
  VaccineImageDeleteResponseDto,
  VaccineImageOverrideResponseDto,
  VaccineImageUploadResponseDto,
} from './vaccine-image-response.dto'
import {
  VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH,
  VaccineImageConcurrentModificationException,
  VaccineImageNotPresentException,
  VaccineImageOverrideReasonException,
} from './vaccine-image-upload.exceptions'
import { VACCINE_IMAGE_STORAGE_PROVIDER } from './vaccine-image-storage.provider'
import type { VaccineImageStorageProvider } from './vaccine-image-storage.provider'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'
import { VaccineImageUrlService } from './vaccine-image-url.service'
import { VaccineImageValidationStatus } from './vaccine-image-validation-status.enum'
import { assertValidVaccineImage } from './vaccine-image.validation'
import { VaccineImage } from './vaccine-image.embed'
import { resolveVaccineImageProviderMode } from './vaccine-image-provider.selection'

/**
 * Vaccine image upload / replace / delete / override orchestration.
 *
 * ## Replacement race behaviour
 * Persistence uses conditional `findOneAndUpdate` matching the previously observed
 * `image.storageKey` (or absence of image). If another request wins the race, the
 * newly uploaded blob is deleted and `VACCINE_IMAGE_CONCURRENT_MODIFICATION` is
 * returned — the previous image is left intact.
 *
 * ## Delete ordering
 * Metadata is cleared first (conditional on the observed storageKey), caches are
 * invalidated, then the blob is deleted. A missing blob after metadata clear is
 * not fatal. This avoids leaving an active catalogue reference to a deleted blob.
 *
 * ## Retained REJECTED / ANALYSIS_FAILED images
 * These remain stored so admins can review evidence, retry analysis, or override.
 * They are not browseable (`imageUrl` stays null) until override/re-upload.
 */
@Injectable()
export class VaccineImageLifecycleService {
  private readonly logger = new Logger(VaccineImageLifecycleService.name)

  constructor(
    @InjectRepository(Vaccine)
    private readonly vaccineRepository: MongoRepository<Vaccine>,
    @Inject(VACCINE_IMAGE_STORAGE_PROVIDER)
    private readonly storage: VaccineImageStorageProvider,
    private readonly analysisService: VaccineImageAnalysisService,
    private readonly imageUrlService: VaccineImageUrlService,
    private readonly auditService: VaccineImageAuditService,
    private readonly applicationCache: ApplicationCacheService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async uploadOrReplace(input: {
    vaccineId: string
    actor: User
    bytes: Buffer
    originalFilename?: string | null
    declaredMimeType?: string | null
  }): Promise<VaccineImageUploadResponseDto> {
    const { objectId, vaccine } = await this.requireVaccine(input.vaccineId)
    const previousKey = vaccine.image?.storageKey ?? null
    const isReplacement = previousKey !== null

    const validated = validateVaccineImageUpload({
      bytes: input.bytes,
      originalFilename: input.originalFilename,
      declaredMimeType: input.declaredMimeType,
    })

    const { analysis, classification } =
      await this.analysisService.analyseAndClassify({
        bytes: validated.bytes,
        mimeType: validated.mimeType,
        filename: validated.displayFilename,
        width: validated.width,
        height: validated.height,
      })

    const storageKey = generateVaccineImageStorageKey(
      objectId.toHexString(),
      validated.extension,
    )

    const storageResult = await this.storage.store({
      bytes: validated.bytes,
      storageKey,
      mimeType: validated.mimeType,
      metadata: { vaccineId: objectId.toHexString() },
    })

    const image = assertValidVaccineImage(
      this.buildImageMetadata({
        storageProvider: storageResult.provider,
        storageKey: storageResult.storageKey,
        validated,
        analysis,
        classificationStatus: classification.status,
        classificationReason: classification.reason,
        actorId: input.actor._id.toString(),
      }),
    )

    let persisted: Vaccine | null
    try {
      persisted = await this.persistImageConditionally({
        objectId,
        previousKey,
        image,
      })
    } catch (error) {
      // Blob uploaded but Mongo failed — delete the new blob; keep previous image.
      await this.safeDeleteBlob(storageKey)
      throw error
    }

    if (!persisted) {
      await this.safeDeleteBlob(storageKey)
      throw new VaccineImageConcurrentModificationException()
    }

    await this.applicationCache.invalidateVaccines()

    await this.auditService.record({
      vaccineId: objectId.toHexString(),
      actorId: input.actor._id.toString(),
      type: isReplacement
        ? VaccineImageAuditEventType.VACCINE_IMAGE_REPLACED
        : VaccineImageAuditEventType.VACCINE_IMAGE_UPLOADED,
      validationStatus: image.validationStatus,
      provider: image.aiProvider,
      replaced: isReplacement,
    })

    if (previousKey && previousKey !== storageKey) {
      await this.safeDeletePreviousBlob(previousKey, objectId.toHexString())
    }

    const imageUrl = await this.imageUrlService.resolveReadUrl(image)
    return {
      vaccineId: objectId.toHexString(),
      image: toVaccineImageSafeDto(image, imageUrl),
    }
  }

  /**
   * Clears metadata first (avoids broken active references), then deletes blob.
   * Idempotent when no image exists.
   */
  async deleteImage(input: {
    vaccineId: string
    actor: User
  }): Promise<VaccineImageDeleteResponseDto> {
    const { objectId, vaccine } = await this.requireVaccine(input.vaccineId)
    const previousKey = vaccine.image?.storageKey ?? null

    if (!previousKey) {
      return { vaccineId: objectId.toHexString(), deleted: false }
    }

    const cleared = await this.vaccineRepository.findOneAndUpdate(
      {
        _id: objectId,
        'image.storageKey': previousKey,
      },
      {
        $unset: { image: '' },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' },
    )

    if (!cleared) {
      // Concurrent delete/replace — treat as idempotent success when image gone.
      const current = await this.vaccineRepository.findOne({
        where: { _id: objectId },
      })
      if (!current?.image) {
        await this.applicationCache.invalidateVaccines()
        return { vaccineId: objectId.toHexString(), deleted: true }
      }
      throw new VaccineImageConcurrentModificationException()
    }

    await this.applicationCache.invalidateVaccines()
    await this.safeDeleteBlob(previousKey)

    await this.auditService.record({
      vaccineId: objectId.toHexString(),
      actorId: input.actor._id.toString(),
      type: VaccineImageAuditEventType.VACCINE_IMAGE_DELETED,
      validationStatus: vaccine.image?.validationStatus ?? null,
      provider: vaccine.image?.aiProvider ?? null,
      replaced: false,
    })

    return { vaccineId: objectId.toHexString(), deleted: true }
  }

  async overrideValidation(input: {
    vaccineId: string
    actor: User
    decision: VaccineImageOverrideDecision.ACCEPTED | VaccineImageOverrideDecision.REJECTED
    reason: string
  }): Promise<VaccineImageOverrideResponseDto> {
    const reason = input.reason.trim()
    if (reason.length === 0) {
      throw new VaccineImageOverrideReasonException(
        'Override reason is required',
      )
    }
    if (reason.length > VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH) {
      throw new VaccineImageOverrideReasonException(
        `Override reason must be at most ${VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH} characters`,
      )
    }

    const { objectId, vaccine } = await this.requireVaccine(input.vaccineId)
    if (!vaccine.image?.storageKey) {
      throw new VaccineImageNotPresentException()
    }

    const previousKey = vaccine.image.storageKey
    const overriddenAt = new Date()
    const nextStatus =
      input.decision === VaccineImageOverrideDecision.ACCEPTED
        ? VaccineImageValidationStatus.ACCEPTED
        : VaccineImageValidationStatus.REJECTED

    const nextImage = assertValidVaccineImage({
      ...vaccine.image,
      validationStatus: nextStatus,
      aiReason: truncateText(reason, VACCINE_IMAGE_ANALYSIS_MAX_REASON_LENGTH),
      adminOverride: {
        decision: input.decision,
        reason: truncateText(reason, VACCINE_IMAGE_OVERRIDE_REASON_MAX_LENGTH),
        overriddenAt,
        overriddenByUserId: input.actor._id.toString(),
      },
    })

    const updated = await this.vaccineRepository.findOneAndUpdate(
      {
        _id: objectId,
        'image.storageKey': previousKey,
      },
      {
        $set: {
          image: nextImage,
          updatedAt: overriddenAt,
        },
      },
      { returnDocument: 'after' },
    )

    if (!updated) {
      throw new VaccineImageConcurrentModificationException()
    }

    await this.applicationCache.invalidateVaccines()

    await this.auditService.record({
      vaccineId: objectId.toHexString(),
      actorId: input.actor._id.toString(),
      type:
        input.decision === VaccineImageOverrideDecision.ACCEPTED
          ? VaccineImageAuditEventType.VACCINE_IMAGE_OVERRIDE_ACCEPTED
          : VaccineImageAuditEventType.VACCINE_IMAGE_OVERRIDE_REJECTED,
      validationStatus: nextStatus,
      provider: nextImage.aiProvider,
      replaced: false,
      reasonSummary: reason,
    })

    const imageUrl = await this.imageUrlService.resolveReadUrl(nextImage)
    return {
      vaccineId: objectId.toHexString(),
      image: toVaccineImageSafeDto(nextImage, imageUrl),
    }
  }

  private async requireVaccine(
    vaccineId: string,
  ): Promise<{ objectId: ObjectId; vaccine: Vaccine }> {
    const parsed = tryParseGraphqlObjectId(vaccineId)
    if (!parsed) {
      throw new VaccineNotFoundException()
    }

    const vaccine = await this.vaccineRepository.findOne({
      where: { _id: parsed.objectId },
    })
    if (!vaccine) {
      throw new VaccineNotFoundException()
    }

    return { objectId: parsed.objectId, vaccine }
  }

  private async persistImageConditionally(input: {
    objectId: ObjectId
    previousKey: string | null
    image: VaccineImage
  }): Promise<Vaccine | null> {
    const filter =
      input.previousKey === null
        ? {
            _id: input.objectId,
            $or: [
              { image: null },
              { image: { $exists: false } },
            ],
          }
        : {
            _id: input.objectId,
            'image.storageKey': input.previousKey,
          }

    const updated = await this.vaccineRepository.findOneAndUpdate(
      filter,
      {
        $set: {
          image: input.image,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    )

    return (updated as Vaccine | null) ?? null
  }

  private buildImageMetadata(input: {
    storageProvider: VaccineImageStorageProviderId
    storageKey: string
    validated: ReturnType<typeof validateVaccineImageUpload>
    analysis: Awaited<
      ReturnType<VaccineImageAnalysisService['analyseAndClassify']>
    >['analysis']
    classificationStatus: VaccineImageValidationStatus
    classificationReason: string
    actorId: string
  }): VaccineImage {
    const analysedAt = input.analysis?.analysedAt ?? new Date()
    const aiProvider =
      input.analysis?.provider ?? this.resolveConfiguredAiProvider()

    return {
      storageProvider: input.storageProvider,
      storageKey: input.storageKey,
      originalFilename: input.validated.displayFilename,
      mimeType: input.validated.mimeType,
      sizeBytes: input.validated.sizeBytes,
      width: input.validated.width,
      height: input.validated.height,
      validationStatus: input.classificationStatus,
      aiProvider,
      aiCaption: input.analysis?.caption
        ? truncateText(
            input.analysis.caption,
            VACCINE_IMAGE_ANALYSIS_MAX_CAPTION_LENGTH,
          )
        : null,
      aiConfidence:
        typeof input.analysis?.captionConfidence === 'number'
          ? input.analysis.captionConfidence
          : null,
      aiTags: input.analysis
        ? boundStringArray(
            analysisLabelNames(input.analysis.tags),
            VACCINE_IMAGE_ANALYSIS_MAX_TAGS,
            128,
          )
        : [],
      aiDetectedText: input.analysis
        ? boundStringArray(
            input.analysis.detectedText,
            VACCINE_IMAGE_ANALYSIS_MAX_DETECTED_TEXT,
            VACCINE_IMAGE_ANALYSIS_MAX_TEXT_LINE_LENGTH,
          )
        : [],
      aiReason: truncateText(
        input.classificationReason,
        VACCINE_IMAGE_ANALYSIS_MAX_REASON_LENGTH,
      ),
      analysedAt,
      uploadedAt: new Date(),
      uploadedByUserId: input.actorId,
      adminOverride: null,
    }
  }

  private resolveConfiguredAiProvider(): VaccineImageAiProvider {
    const mode = resolveVaccineImageProviderMode(
      this.configService.get('VACCINE_IMAGE_ANALYSIS_PROVIDER', {
        infer: true,
      }),
      this.configService.get('NODE_ENV', { infer: true }),
    )
    return mode === 'fake'
      ? VaccineImageAiProvider.FAKE
      : VaccineImageAiProvider.AZURE_VISION_4
  }

  private async safeDeleteBlob(storageKey: string): Promise<void> {
    // Missing blob is treated as success by Azure/fake providers (deleteIfExists).
    // Permission/network failures remain visible to the caller.
    await this.storage.delete(storageKey)
  }

  private async safeDeletePreviousBlob(
    storageKey: string,
    vaccineId: string,
  ): Promise<void> {
    try {
      await this.storage.delete(storageKey)
    } catch (error) {
      const code =
        error &&
        typeof error === 'object' &&
        'getResponse' in error &&
        typeof (error as { getResponse: () => unknown }).getResponse ===
          'function'
          ? (() => {
              const response = (
                error as { getResponse: () => unknown }
              ).getResponse()
              if (
                response &&
                typeof response === 'object' &&
                'error' in response &&
                typeof (response as { error?: unknown }).error === 'string'
              ) {
                return (response as { error: string }).error
              }
              return 'UNKNOWN'
            })()
          : 'UNKNOWN'

      // Keep the successful replacement; do not roll back. Never log SAS/keys.
      this.logger.warn(
        `Failed to delete previous vaccine image blob after successful replacement (vaccineId=${vaccineId}, error=${code})`,
      )
    }
  }
}
