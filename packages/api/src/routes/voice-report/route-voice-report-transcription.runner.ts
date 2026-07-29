import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { EnvConfig } from '../../config/env.validation'
import { tryParseGraphqlObjectId } from '../../common/mongodb/graphql-object-id.util'
import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import {
  isRouteVoiceTranscriptionProviderError,
  RouteVoiceTranscriptionProviderError,
} from './azure-route-voice-transcription.errors'
import { RouteVoiceReportAuditService } from './route-voice-report-audit.service'
import {
  createPendingTranscription,
  mapSelectedLocaleToRequested,
  resolveEffectiveDurationSeconds,
} from './route-voice-report-transcription.embed'
import {
  hasTranscriptionObject,
  RouteVoiceReport,
} from './route-voice-report.entity'
import { RouteVoiceReportEventsService } from './route-voice-report-events.service'
import {
  RouteVoiceTranscriptionAlreadyCompletedException,
  RouteVoiceTranscriptionAlreadyProcessingException,
  RouteVoiceTranscriptionForbiddenException,
  RouteVoiceTranscriptionNotFoundException,
  RouteVoiceTranscriptionRetryNotAllowedException,
  RouteVoiceReportNotAvailableException,
} from './route-voice-report.exceptions'
import { RouteVoiceReportStatus } from './route-voice-report-status.enum'
import {
  ROUTE_VOICE_REPORT_STORAGE_PROVIDER,
  type RouteVoiceReportStorageProvider,
} from './route-voice-report-storage.provider'
import { assessRouteVoiceTranscriptionCompatibility } from './route-voice-transcription-compatibility'
import {
  ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY_DEFAULT,
  ROUTE_VOICE_TRANSCRIPTION_DURATION_MISMATCH_RATIO,
  ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS_DEFAULT,
  ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS_DEFAULT,
  ROUTE_VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES,
  ROUTE_VOICE_TRANSCRIPTION_MAX_SAFE_FAILURE_MESSAGE_LENGTH,
  ROUTE_VOICE_TRANSCRIPTION_RECOVERY_BATCH_DEFAULT,
  ROUTE_VOICE_TRANSCRIPTION_RETRY_BASE_DELAY_MS,
  ROUTE_VOICE_TRANSCRIPTION_RETRY_MAX_DELAY_MS,
  RouteVoiceTranscriptionFailureCode,
} from './route-voice-transcription.constants'
import {
  ROUTE_VOICE_TRANSCRIPTION_PROVIDER,
  type RouteVoiceTranscriptionProvider,
} from './route-voice-transcription.provider'
import { RouteVoiceTranscriptionStatus } from './route-voice-transcription-status.enum'

/**
 * Persisted in-process transcription runner (Phase 34B).
 *
 * - Queues report IDs only (not audio bytes)
 * - Bounded concurrency (1–2)
 * - Mongo lease CAS is authoritative across restarts / duplicate instances
 * - Does not hold the upload HTTP request open
 */
@Injectable()
export class RouteVoiceReportTranscriptionRunner implements OnModuleInit {
  private readonly logger = new Logger(RouteVoiceReportTranscriptionRunner.name)
  private readonly inMemoryQueued = new Set<string>()
  private activeCount = 0
  private readonly concurrency: number
  private readonly maxAttempts: number
  private readonly leaseSeconds: number
  private readonly recoveryBatchSize: number
  private readonly enabled: boolean
  private started = false

  constructor(
    @InjectRepository(RouteVoiceReport)
    private readonly reportRepository: MongoRepository<RouteVoiceReport>,
    @Inject(ROUTE_VOICE_REPORT_STORAGE_PROVIDER)
    private readonly storage: RouteVoiceReportStorageProvider,
    @Inject(ROUTE_VOICE_TRANSCRIPTION_PROVIDER)
    private readonly transcriptionProvider: RouteVoiceTranscriptionProvider,
    private readonly auditService: RouteVoiceReportAuditService,
    private readonly eventsService: RouteVoiceReportEventsService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {
    this.enabled =
      this.configService.get('ROUTE_VOICE_TRANSCRIPTION_ENABLED', {
        infer: true,
      }) ?? true
    this.concurrency =
      this.configService.get('ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY', {
        infer: true,
      }) ?? ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY_DEFAULT
    this.maxAttempts =
      this.configService.get('ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS', {
        infer: true,
      }) ?? ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS_DEFAULT
    this.leaseSeconds =
      this.configService.get('ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS', {
        infer: true,
      }) ?? ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS_DEFAULT
    this.recoveryBatchSize =
      this.configService.get('ROUTE_VOICE_TRANSCRIPTION_RECOVERY_BATCH_SIZE', {
        infer: true,
      }) ?? ROUTE_VOICE_TRANSCRIPTION_RECOVERY_BATCH_DEFAULT
  }

  async onModuleInit(): Promise<void> {
    if (this.started) {
      return
    }
    this.started = true
    if (!this.enabled) {
      return
    }
    try {
      await this.recoverStaleAndPendingWork()
    } catch {
      this.logger.warn('voice_transcription_startup_recovery_failed')
    }
  }

  /** Internal / test entry: recover PENDING + expired PROCESSING leases. */
  async recoverStaleAndPendingWork(now: Date = new Date()): Promise<number> {
    const pending = await this.reportRepository.find({
      where: {
        status: RouteVoiceReportStatus.AVAILABLE,
        'transcription.status': RouteVoiceTranscriptionStatus.PENDING,
      } as never,
      take: this.recoveryBatchSize,
      order: { updatedAt: 'ASC' },
    })

    const processing = await this.reportRepository.find({
      where: {
        status: RouteVoiceReportStatus.AVAILABLE,
        'transcription.status': RouteVoiceTranscriptionStatus.PROCESSING,
      } as never,
      take: this.recoveryBatchSize,
      order: { updatedAt: 'ASC' },
    })

    const stale = processing.filter(report => {
      const expires = report.transcription?.processingLeaseExpiresAt
      return (
        expires instanceof Date && expires.getTime() <= now.getTime()
      )
    })

    let scheduled = 0
    for (const report of [...pending, ...stale]) {
      this.schedule(report.id)
      scheduled += 1
    }
    return scheduled
  }

  /**
   * Admin maintenance: enqueue legacy AVAILABLE reports lacking transcription.
   * Bounded batch — never unbounded startup rewrite.
   */
  async enqueueLegacyAvailableReports(
    limit: number = this.recoveryBatchSize,
  ): Promise<number> {
    const cap = Math.min(
      Math.max(1, limit),
      this.recoveryBatchSize,
    )
    const candidates = await this.reportRepository.find({
      where: {
        status: RouteVoiceReportStatus.AVAILABLE,
      },
      take: cap * 4,
      order: { createdAt: 'ASC' },
    })

    let enqueued = 0
    for (const report of candidates) {
      if (enqueued >= cap) {
        break
      }
      if (hasTranscriptionObject(report)) {
        continue
      }
      const locale = mapSelectedLocaleToRequested(report.selectedLocale)
      const now = new Date()
      const result = await this.reportRepository.updateOne(
        {
          _id: report._id,
          status: RouteVoiceReportStatus.AVAILABLE,
          transcription: null,
        },
        {
          $set: {
            transcription: createPendingTranscription(locale),
            updatedAt: now,
          },
        },
      )
      if ((result.modifiedCount ?? 0) > 0) {
        this.schedule(report.id)
        enqueued += 1
      }
    }
    return enqueued
  }

  schedule(reportId: string): void {
    if (!this.enabled) {
      return
    }
    if (this.inMemoryQueued.has(reportId)) {
      return
    }
    this.inMemoryQueued.add(reportId)
    void this.pump()
  }

  /**
   * ADMIN-only: reset FAILED → PENDING and schedule (idempotent while PENDING).
   */
  async retryTranscriptionForAdmin(
    actor: User,
    routeId: string,
    reportId: string,
  ): Promise<{ reportId: string; transcriptionStatus: 'PENDING' }> {
    if (actor.role !== UserRole.ADMIN) {
      throw new RouteVoiceTranscriptionForbiddenException()
    }

    const parsedRouteId = tryParseGraphqlObjectId(routeId)
    const parsedReportId = tryParseGraphqlObjectId(reportId)
    if (!parsedRouteId || !parsedReportId) {
      throw new RouteVoiceTranscriptionNotFoundException()
    }

    const report = await this.reportRepository.findOne({
      where: { _id: parsedReportId.objectId },
    })
    if (!report || report.routeId !== parsedRouteId.stringValue) {
      throw new RouteVoiceTranscriptionNotFoundException()
    }
    if (report.status !== RouteVoiceReportStatus.AVAILABLE) {
      throw new RouteVoiceReportNotAvailableException()
    }
    if (!hasTranscriptionObject(report)) {
      throw new RouteVoiceTranscriptionRetryNotAllowedException()
    }

    const tx = report.transcription
    if (tx.status === RouteVoiceTranscriptionStatus.COMPLETED) {
      throw new RouteVoiceTranscriptionAlreadyCompletedException()
    }
    if (tx.status === RouteVoiceTranscriptionStatus.PROCESSING) {
      throw new RouteVoiceTranscriptionAlreadyProcessingException()
    }
    if (tx.status === RouteVoiceTranscriptionStatus.PENDING) {
      this.schedule(report.id)
      return {
        reportId: report.id,
        transcriptionStatus: RouteVoiceTranscriptionStatus.PENDING,
      }
    }
    if (tx.status !== RouteVoiceTranscriptionStatus.FAILED) {
      throw new RouteVoiceTranscriptionRetryNotAllowedException()
    }

    const previousFailureCode = tx.failureCode
    const now = new Date()
    const nextGeneration = (tx.retryGeneration ?? 0) + 1
    const result = await this.reportRepository.updateOne(
      {
        _id: report._id,
        status: RouteVoiceReportStatus.AVAILABLE,
        'transcription.status': RouteVoiceTranscriptionStatus.FAILED,
      },
      {
        $set: {
          'transcription.status': RouteVoiceTranscriptionStatus.PENDING,
          'transcription.failureCode': null,
          'transcription.failureMessageSafe': null,
          'transcription.processingLeaseId': null,
          'transcription.processingLeaseExpiresAt': null,
          'transcription.text': null,
          'transcription.confidence': null,
          'transcription.detectedLocale': null,
          'transcription.audioDurationSeconds': null,
          'transcription.completedAt': null,
          'transcription.retryGeneration': nextGeneration,
          updatedAt: now,
        },
      },
    )

    if ((result.modifiedCount ?? 0) === 0) {
      const refreshed = await this.reportRepository.findOne({
        where: { _id: report._id },
      })
      if (
        refreshed?.transcription?.status ===
        RouteVoiceTranscriptionStatus.PENDING
      ) {
        this.schedule(report.id)
        return {
          reportId: report.id,
          transcriptionStatus: RouteVoiceTranscriptionStatus.PENDING,
        }
      }
      throw new RouteVoiceTranscriptionRetryNotAllowedException()
    }

    await this.auditService.recordTranscriptionRetried({
      routeId: report.routeId,
      reportId: report.id,
      adminActorUserId: actor._id.toString(),
      previousFailureCode,
      requestedAt: now,
      retryGeneration: nextGeneration,
    })

    await this.eventsService.publishTranscriptionUpdate({
      routeId: report.routeId,
      reportId: report.id,
      stopId: report.stopId ?? null,
      status: RouteVoiceReportStatus.AVAILABLE,
      transcriptionStatus: RouteVoiceTranscriptionStatus.PENDING,
      eventType: 'ROUTE_VOICE_REPORT_TRANSCRIPTION_RETRIED',
    })

    this.schedule(report.id)
    return {
      reportId: report.id,
      transcriptionStatus: RouteVoiceTranscriptionStatus.PENDING,
    }
  }

  private pump(): void {
    while (this.activeCount < this.concurrency && this.inMemoryQueued.size > 0) {
      const next = this.inMemoryQueued.values().next()
      const reportId = next.value
      if (typeof reportId !== 'string') {
        break
      }
      this.inMemoryQueued.delete(reportId)
      this.activeCount += 1
      void this.runOne(reportId)
        .catch(() => {
          this.logger.warn(
            `voice_transcription_job_failed correlation=${reportId}`,
          )
        })
        .finally(() => {
          this.activeCount -= 1
          this.pump()
        })
    }
  }

  private async runOne(reportId: string): Promise<void> {
    const claim = await this.claimForProcessing(reportId)
    if (!claim) {
      return
    }

    const { report, leaseId } = claim
    await this.eventsService.publishTranscriptionUpdate({
      routeId: report.routeId,
      reportId: report.id,
      stopId: report.stopId ?? null,
      status: RouteVoiceReportStatus.AVAILABLE,
      transcriptionStatus: RouteVoiceTranscriptionStatus.PROCESSING,
      eventType: 'ROUTE_VOICE_REPORT_TRANSCRIPTION_PROCESSING',
    })

    try {
      const compatibility = assessRouteVoiceTranscriptionCompatibility({
        mimeType: report.mimeType,
        fileExtension: report.fileExtension,
      })
      if (compatibility.outcome === 'unsupported') {
        await this.finaliseFailure({
          report,
          leaseId,
          failureCode: RouteVoiceTranscriptionFailureCode.AUDIO_UNSUPPORTED,
          transient: false,
          attemptCount: report.transcription!.attemptCount,
        })
        return
      }

      const audioBytes = await this.loadAudioBytes(report)
      const result = await this.transcriptionProvider.transcribe({
        audioBytes,
        mimeType: report.mimeType,
        requestedLocale: report.transcription!.requestedLocale,
        fileNameHint: `route-report-${report.sequenceNumber}.${report.fileExtension}`,
        correlationId: report.id,
      })

      this.maybeLogDurationMismatch(
        report.durationSeconds,
        result.audioDurationSeconds,
        report.id,
      )

      await this.finaliseSuccess({
        report,
        leaseId,
        text: result.text,
        detectedLocale: result.detectedLocale,
        confidence: result.confidence,
        audioDurationSeconds: result.audioDurationSeconds,
        providerRequestId: result.providerRequestId,
        attemptCount: report.transcription!.attemptCount,
      })
    } catch (error) {
      const mapped = mapProviderErrorToFailure(error)
      const attemptCount = report.transcription!.attemptCount
      const shouldRetry =
        mapped.transient && attemptCount < this.maxAttempts

      if (shouldRetry) {
        await this.releaseToPendingForRetry({
          report,
          leaseId,
          failureCode: mapped.failureCode,
          attemptCount,
        })
        const delay = Math.min(
          ROUTE_VOICE_TRANSCRIPTION_RETRY_MAX_DELAY_MS,
          ROUTE_VOICE_TRANSCRIPTION_RETRY_BASE_DELAY_MS *
            2 ** Math.max(0, attemptCount - 1),
        )
        setTimeout(() => this.schedule(report.id), delay)
        return
      }

      await this.finaliseFailure({
        report,
        leaseId,
        failureCode: mapped.failureCode,
        transient: mapped.transient,
        attemptCount,
      })
    }
  }

  private async claimForProcessing(
    reportId: string,
  ): Promise<{ report: RouteVoiceReport; leaseId: string } | null> {
    const parsed = tryParseGraphqlObjectId(reportId)
    if (!parsed) {
      return null
    }

    const existing = await this.reportRepository.findOne({
      where: { _id: parsed.objectId },
    })
    if (
      !existing ||
      existing.status !== RouteVoiceReportStatus.AVAILABLE ||
      !hasTranscriptionObject(existing)
    ) {
      return null
    }

    const tx = existing.transcription
    if (tx.status === RouteVoiceTranscriptionStatus.COMPLETED) {
      return null
    }

    const now = new Date()
    const leaseExpired =
      tx.status === RouteVoiceTranscriptionStatus.PROCESSING &&
      tx.processingLeaseExpiresAt instanceof Date &&
      tx.processingLeaseExpiresAt.getTime() <= now.getTime()

    // Permanent FAILED is only claimable after admin retry resets to PENDING.
    if (
      tx.status === RouteVoiceTranscriptionStatus.FAILED &&
      !isTransientFailureCode(tx.failureCode)
    ) {
      return null
    }

    if (tx.status === RouteVoiceTranscriptionStatus.PROCESSING && !leaseExpired) {
      return null
    }

    const canClaimPending = tx.status === RouteVoiceTranscriptionStatus.PENDING
    const canClaimTransientFailed =
      tx.status === RouteVoiceTranscriptionStatus.FAILED &&
      (tx.attemptCount ?? 0) < this.maxAttempts &&
      isTransientFailureCode(tx.failureCode)

    if (!canClaimPending && !canClaimTransientFailed && !leaseExpired) {
      return null
    }

    const leaseId = randomUUID()
    const leaseExpiresAt = new Date(now.getTime() + this.leaseSeconds * 1000)
    const filter: Record<string, unknown> = {
      _id: parsed.objectId,
      status: RouteVoiceReportStatus.AVAILABLE,
    }

    if (leaseExpired) {
      filter['transcription.status'] = RouteVoiceTranscriptionStatus.PROCESSING
      filter['transcription.processingLeaseExpiresAt'] = {
        $lte: now,
      }
    } else if (canClaimPending) {
      filter['transcription.status'] = RouteVoiceTranscriptionStatus.PENDING
    } else if (canClaimTransientFailed) {
      filter['transcription.status'] = RouteVoiceTranscriptionStatus.FAILED
    } else {
      return null
    }

    const result = await this.reportRepository.updateOne(filter, {
      $set: {
        'transcription.status': RouteVoiceTranscriptionStatus.PROCESSING,
        'transcription.processingLeaseId': leaseId,
        'transcription.processingLeaseExpiresAt': leaseExpiresAt,
        'transcription.startedAt': tx.startedAt ?? now,
        'transcription.lastAttemptAt': now,
        'transcription.failureCode': null,
        'transcription.failureMessageSafe': null,
        updatedAt: now,
      },
      $inc: {
        'transcription.attemptCount': 1,
      },
    })

    if ((result.modifiedCount ?? 0) === 0) {
      return null
    }

    const claimed = await this.reportRepository.findOne({
      where: { _id: parsed.objectId },
    })
    if (
      !claimed ||
      claimed.transcription?.processingLeaseId !== leaseId ||
      claimed.transcription?.status !== RouteVoiceTranscriptionStatus.PROCESSING
    ) {
      return null
    }

    return { report: claimed, leaseId }
  }

  private async loadAudioBytes(report: RouteVoiceReport): Promise<Buffer> {
    const props = await this.storage.getProperties(report.blobName)
    if (!props || props.contentLength <= 0) {
      throw new RouteVoiceTranscriptionProviderError({
        kind: 'unsupported_audio',
        transient: false,
        message: 'Audio blob missing',
      })
    }
    if (
      props.contentLength > ROUTE_VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES ||
      props.contentLength > report.sizeBytes
    ) {
      throw new RouteVoiceTranscriptionProviderError({
        kind: 'unsupported_audio',
        transient: false,
        message: 'Audio blob exceeds stored size limit',
      })
    }

    const download = await this.storage.downloadRange({
      blobName: report.blobName,
      offset: 0,
      count: props.contentLength,
    })

    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of download.stream) {
      const buf: Buffer = Buffer.isBuffer(chunk)
        ? Buffer.from(chunk)
        : Buffer.from(chunk as Uint8Array)
      total += buf.length
      if (total > ROUTE_VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES) {
        download.stream.destroy()
        throw new RouteVoiceTranscriptionProviderError({
          kind: 'unsupported_audio',
          transient: false,
          message: 'Audio download exceeded size bound',
        })
      }
      chunks.push(buf)
    }
    if (total === 0) {
      throw new RouteVoiceTranscriptionProviderError({
        kind: 'unsupported_audio',
        transient: false,
        message: 'Audio blob empty',
      })
    }
    return Buffer.concat(chunks)
  }

  private async finaliseSuccess(input: {
    report: RouteVoiceReport
    leaseId: string
    text: string
    detectedLocale: string | null
    confidence: number | null
    audioDurationSeconds: number | null
    providerRequestId: string | null
    attemptCount: number
  }): Promise<void> {
    const now = new Date()
    const nextVersion =
      (input.report.transcription?.transcriptVersion ?? 0) + 1
    const result = await this.reportRepository.updateOne(
      {
        _id: input.report._id,
        'transcription.processingLeaseId': input.leaseId,
        'transcription.status': RouteVoiceTranscriptionStatus.PROCESSING,
      },
      {
        $set: {
          'transcription.status': RouteVoiceTranscriptionStatus.COMPLETED,
          'transcription.text': input.text,
          'transcription.detectedLocale': input.detectedLocale,
          'transcription.confidence': input.confidence,
          'transcription.audioDurationSeconds': input.audioDurationSeconds,
          'transcription.providerRequestId': input.providerRequestId,
          'transcription.completedAt': now,
          'transcription.failureCode': null,
          'transcription.failureMessageSafe': null,
          'transcription.processingLeaseId': null,
          'transcription.processingLeaseExpiresAt': null,
          'transcription.transcriptVersion': nextVersion,
          updatedAt: now,
        },
      },
    )

    if ((result.modifiedCount ?? 0) === 0) {
      // Stale worker — do not overwrite newer lease/completion.
      return
    }

    const audit = await this.auditService.recordTranscriptionCompleted({
      routeId: input.report.routeId,
      reportId: input.report.id,
      sequenceNumber: input.report.sequenceNumber,
      provider: 'AZURE_SPEECH',
      requestedLocale: input.report.transcription!.requestedLocale,
      detectedLocale: input.detectedLocale,
      durationSeconds: resolveEffectiveDurationSeconds({
        clientDurationSeconds: input.report.durationSeconds,
        transcriptionAudioDurationSeconds: input.audioDurationSeconds,
      }),
      completedAt: now,
      attemptCount: input.attemptCount,
    })

    if (audit.inserted) {
      await this.eventsService.publishTranscriptionUpdate({
        routeId: input.report.routeId,
        reportId: input.report.id,
        stopId: input.report.stopId ?? null,
        status: RouteVoiceReportStatus.AVAILABLE,
        transcriptionStatus: RouteVoiceTranscriptionStatus.COMPLETED,
        eventType: 'ROUTE_VOICE_REPORT_TRANSCRIPTION_COMPLETED',
      })
    }
  }

  private async finaliseFailure(input: {
    report: RouteVoiceReport
    leaseId: string
    failureCode: string
    transient: boolean
    attemptCount: number
  }): Promise<void> {
    const now = new Date()
    const safeMessage = truncateSafe(
      input.failureCode,
      ROUTE_VOICE_TRANSCRIPTION_MAX_SAFE_FAILURE_MESSAGE_LENGTH,
    )
    const result = await this.reportRepository.updateOne(
      {
        _id: input.report._id,
        'transcription.processingLeaseId': input.leaseId,
        'transcription.status': RouteVoiceTranscriptionStatus.PROCESSING,
      },
      {
        $set: {
          'transcription.status': RouteVoiceTranscriptionStatus.FAILED,
          'transcription.failureCode': input.failureCode,
          'transcription.failureMessageSafe': safeMessage,
          'transcription.completedAt': now,
          'transcription.processingLeaseId': null,
          'transcription.processingLeaseExpiresAt': null,
          'transcription.text': null,
          updatedAt: now,
        },
      },
    )

    if ((result.modifiedCount ?? 0) === 0) {
      return
    }

    // Missing blob maps to AUDIO_MISSING for clarity.
    const code =
      input.failureCode === RouteVoiceTranscriptionFailureCode.AUDIO_UNSUPPORTED &&
      input.report.blobName
        ? input.failureCode
        : input.failureCode

    const audit = await this.auditService.recordTranscriptionFailed({
      routeId: input.report.routeId,
      reportId: input.report.id,
      sequenceNumber: input.report.sequenceNumber,
      provider: 'AZURE_SPEECH',
      failureCode: code,
      attemptCount: input.attemptCount,
      failedAt: now,
    })

    if (audit.inserted) {
      await this.eventsService.publishTranscriptionUpdate({
        routeId: input.report.routeId,
        reportId: input.report.id,
        stopId: input.report.stopId ?? null,
        status: RouteVoiceReportStatus.AVAILABLE,
        transcriptionStatus: RouteVoiceTranscriptionStatus.FAILED,
        eventType: 'ROUTE_VOICE_REPORT_TRANSCRIPTION_FAILED',
      })
    }
  }

  private async releaseToPendingForRetry(input: {
    report: RouteVoiceReport
    leaseId: string
    failureCode: string
    attemptCount: number
  }): Promise<void> {
    const now = new Date()
    await this.reportRepository.updateOne(
      {
        _id: input.report._id,
        'transcription.processingLeaseId': input.leaseId,
        'transcription.status': RouteVoiceTranscriptionStatus.PROCESSING,
      },
      {
        $set: {
          'transcription.status': RouteVoiceTranscriptionStatus.PENDING,
          'transcription.failureCode': input.failureCode,
          'transcription.failureMessageSafe': truncateSafe(
            input.failureCode,
            ROUTE_VOICE_TRANSCRIPTION_MAX_SAFE_FAILURE_MESSAGE_LENGTH,
          ),
          'transcription.processingLeaseId': null,
          'transcription.processingLeaseExpiresAt': null,
          updatedAt: now,
        },
      },
    )
    // No final failure audit on intermediate transient retries.
  }

  private maybeLogDurationMismatch(
    clientSeconds: number,
    azureSeconds: number | null,
    correlationId: string,
  ): void {
    if (
      azureSeconds === null ||
      !Number.isFinite(azureSeconds) ||
      azureSeconds <= 0 ||
      !Number.isFinite(clientSeconds) ||
      clientSeconds <= 0
    ) {
      return
    }
    const ratio =
      Math.abs(azureSeconds - clientSeconds) /
      Math.max(clientSeconds, azureSeconds)
    if (ratio > ROUTE_VOICE_TRANSCRIPTION_DURATION_MISMATCH_RATIO) {
      this.logger.warn(
        `voice_transcription_duration_mismatch correlation=${correlationId}`,
      )
    }
  }
}

export function mapProviderErrorToFailure(error: unknown): {
  failureCode: string
  transient: boolean
} {
  if (isRouteVoiceTranscriptionProviderError(error)) {
    switch (error.kind) {
      case 'timeout':
        return {
          failureCode: RouteVoiceTranscriptionFailureCode.PROVIDER_TIMEOUT,
          transient: true,
        }
      case 'throttled':
        return {
          failureCode: RouteVoiceTranscriptionFailureCode.PROVIDER_THROTTLED,
          transient: true,
        }
      case 'unavailable':
        return {
          failureCode: RouteVoiceTranscriptionFailureCode.PROVIDER_UNAVAILABLE,
          transient: true,
        }
      case 'unsupported_audio':
        return {
          failureCode:
            error.message.includes('missing') || error.message.includes('empty')
              ? RouteVoiceTranscriptionFailureCode.AUDIO_MISSING
              : RouteVoiceTranscriptionFailureCode.AUDIO_UNSUPPORTED,
          transient: false,
        }
      case 'no_speech':
        return {
          failureCode: RouteVoiceTranscriptionFailureCode.NO_SPEECH,
          transient: false,
        }
      case 'result_invalid':
        return {
          failureCode: RouteVoiceTranscriptionFailureCode.RESULT_INVALID,
          transient: false,
        }
      case 'rejected':
        return {
          failureCode: RouteVoiceTranscriptionFailureCode.PROVIDER_REJECTED,
          transient: false,
        }
      case 'not_configured':
        return {
          failureCode: RouteVoiceTranscriptionFailureCode.NOT_CONFIGURED,
          transient: false,
        }
      default:
        return {
          failureCode: RouteVoiceTranscriptionFailureCode.FAILED,
          transient: error.transient,
        }
    }
  }
  return {
    failureCode: RouteVoiceTranscriptionFailureCode.FAILED,
    transient: true,
  }
}

function isTransientFailureCode(code: string | null | undefined): boolean {
  return (
    code === RouteVoiceTranscriptionFailureCode.PROVIDER_TIMEOUT ||
    code === RouteVoiceTranscriptionFailureCode.PROVIDER_THROTTLED ||
    code === RouteVoiceTranscriptionFailureCode.PROVIDER_UNAVAILABLE ||
    code === RouteVoiceTranscriptionFailureCode.FAILED
  )
}

function truncateSafe(value: string, max: number): string {
  return value.slice(0, max)
}