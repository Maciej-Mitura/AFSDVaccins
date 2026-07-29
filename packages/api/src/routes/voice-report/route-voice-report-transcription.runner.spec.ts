import { ObjectId } from 'mongodb'

import { UserRole } from '../../user/user-role.enum'
import { FakeRouteVoiceReportStorageProvider } from './fake-route-voice-report-storage.provider'
import { FakeRouteVoiceTranscriptionProvider } from './fake-route-voice-transcription.provider'
import { generateRouteVoiceReportBlobName } from './route-voice-report-audio.validation'
import { createPendingTranscription } from './route-voice-report-transcription.embed'
import { RouteVoiceReport } from './route-voice-report.entity'
import { RouteVoiceReportStatus } from './route-voice-report-status.enum'
import { RouteVoiceReportTranscriptionRunner } from './route-voice-report-transcription.runner'
import { assessRouteVoiceTranscriptionCompatibility } from './route-voice-transcription-compatibility'
import {
  RouteVoiceTranscriptionFailureCode,
} from './route-voice-transcription.constants'
import { RouteVoiceTranscriptionLocale } from './route-voice-transcription-locale.enum'
import { RouteVoiceTranscriptionStatus } from './route-voice-transcription-status.enum'
import {
  RouteVoiceTranscriptionAlreadyCompletedException,
  RouteVoiceTranscriptionForbiddenException,
} from './route-voice-report.exceptions'

function webmFixture(extraBytes = 64): Buffer {
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.alloc(extraBytes, 0x01),
  ])
}

describe('RouteVoiceReportTranscriptionRunner', () => {
  const routeId = new ObjectId().toString()
  const adminActor = {
    _id: new ObjectId(),
    role: UserRole.ADMIN,
  } as never
  const courierActor = {
    _id: new ObjectId(),
    role: UserRole.BEZORGER,
  } as never

  function buildReport(
    overrides?: Partial<RouteVoiceReport> & { _id?: ObjectId },
  ): RouteVoiceReport {
    const id = overrides?._id ?? new ObjectId()
    const bytes = webmFixture()
    const blobName =
      overrides?.blobName ??
      generateRouteVoiceReportBlobName({
        routeId,
        stopId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        reportId: id.toString(),
        extension: 'webm',
      })
    const now = new Date('2026-07-27T10:00:00.000Z')
    return {
      _id: id,
      routeId,
      stopId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      apothekerProfileId: new ObjectId().toString(),
      bezorgerProfileId: new ObjectId().toString(),
      recordedByUserId: new ObjectId().toString(),
      sequenceNumber: 1,
      status: RouteVoiceReportStatus.AVAILABLE,
      blobName,
      containerName: 'route-voice-reports',
      mimeType: 'audio/webm',
      codec: 'opus',
      fileExtension: 'webm',
      sizeBytes: bytes.length,
      durationSeconds: 12,
      sha256: 'abc',
      clientRecordedAt: now,
      uploadedAt: now,
      selectedLocale: 'nl-NL',
      browserFormatLabel: null,
      clientUploadId: 'upload-1',
      idempotencyFingerprint: 'fp',
      transcription: createPendingTranscription(
        RouteVoiceTranscriptionLocale.NL_NL,
      ),
      createdAt: now,
      updatedAt: now,
      ...overrides,
      get id() {
        return this._id.toString()
      },
    }
  }

  function setNested(target: Record<string, unknown>, path: string, value: unknown) {
    const parts = path.split('.')
    let cursor: Record<string, unknown> = target
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i]
      if (
        cursor[key] === undefined ||
        cursor[key] === null ||
        typeof cursor[key] !== 'object'
      ) {
        cursor[key] = {}
      }
      cursor = cursor[key] as Record<string, unknown>
    }
    cursor[parts[parts.length - 1]] = value
  }

  function matchesFilter(
    report: RouteVoiceReport,
    filter: Record<string, unknown>,
  ): boolean {
    return Object.entries(filter).every(([key, expected]) => {
      if (key === '_id') {
        return report._id.toString() === (expected as ObjectId).toString()
      }
      if (key.includes('.')) {
        const parts = key.split('.')
        let cursor: unknown = report
        for (const part of parts) {
          if (cursor === null || typeof cursor !== 'object') {
            return false
          }
          cursor = (cursor as Record<string, unknown>)[part]
        }
        if (
          expected &&
          typeof expected === 'object' &&
          '$lte' in (expected)
        ) {
          const bound = (expected as { $lte: Date }).$lte
          return (
            cursor instanceof Date && cursor.getTime() <= bound.getTime()
          )
        }
        return cursor === expected
      }
      return (report as unknown as Record<string, unknown>)[key] === expected
    })
  }

  function buildRunner(input?: {
    reports?: RouteVoiceReport[]
    provider?: FakeRouteVoiceTranscriptionProvider
    maxAttempts?: number
    concurrency?: number
    enabled?: boolean
  }) {
    const reports = [...(input?.reports ?? [])]
    const storage = new FakeRouteVoiceReportStorageProvider()
    for (const report of reports) {
      if (report.status === RouteVoiceReportStatus.AVAILABLE) {
        void storage.store({
          bytes: webmFixture(report.sizeBytes - 4),
          blobName: report.blobName,
          mimeType: report.mimeType,
        })
      }
    }

    const provider =
      input?.provider ?? new FakeRouteVoiceTranscriptionProvider()

    const reportRepository = {
      findOne: jest.fn().mockImplementation((opts: { where: Record<string, unknown> }) => {
        const found = reports.find(report =>
          matchesFilter(report, opts.where ?? {}),
        )
        return Promise.resolve(found ?? null)
      }),
      find: jest.fn().mockImplementation((opts?: {
        where?: Record<string, unknown>
        take?: number
      }) => {
        let result = reports.filter(report =>
          matchesFilter(report, (opts?.where ?? {})),
        )
        if (opts?.take) {
          result = result.slice(0, opts.take)
        }
        return Promise.resolve(result)
      }),
      updateOne: jest.fn().mockImplementation(
        (
          filter: Record<string, unknown>,
          update: {
            $set?: Record<string, unknown>
            $inc?: Record<string, number>
          },
        ) => {
          const target = reports.find(report => matchesFilter(report, filter))
          if (!target) {
            return Promise.resolve({ modifiedCount: 0 })
          }
          if (update.$set) {
            for (const [key, value] of Object.entries(update.$set)) {
              if (key.includes('.')) {
                setNested(target as unknown as Record<string, unknown>, key, value)
              } else {
                ;(target as unknown as Record<string, unknown>)[key] = value
              }
            }
          }
          if (update.$inc) {
            for (const [key, value] of Object.entries(update.$inc)) {
              const parts = key.split('.')
              let cursor: Record<string, unknown> =
                target as unknown as Record<string, unknown>
              for (let i = 0; i < parts.length - 1; i += 1) {
                cursor = cursor[parts[i]] as Record<string, unknown>
              }
              const leaf = parts[parts.length - 1]
              const current = Number(cursor[leaf] ?? 0)
              cursor[leaf] = current + value
            }
          }
          return Promise.resolve({ modifiedCount: 1 })
        },
      ),
    }

    const audit = {
      recordTranscriptionCompleted: jest
        .fn()
        .mockResolvedValue({ inserted: true }),
      recordTranscriptionFailed: jest.fn().mockResolvedValue({ inserted: true }),
      recordTranscriptionRetried: jest
        .fn()
        .mockResolvedValue({ inserted: true }),
    }
    const events = {
      publishTranscriptionUpdate: jest.fn().mockResolvedValue(undefined),
    }
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'ROUTE_VOICE_TRANSCRIPTION_ENABLED':
            return input?.enabled ?? true
          case 'ROUTE_VOICE_TRANSCRIPTION_CONCURRENCY':
            return input?.concurrency ?? 1
          case 'ROUTE_VOICE_TRANSCRIPTION_MAX_ATTEMPTS':
            return input?.maxAttempts ?? 3
          case 'ROUTE_VOICE_TRANSCRIPTION_LEASE_SECONDS':
            return 600
          case 'ROUTE_VOICE_TRANSCRIPTION_RECOVERY_BATCH_SIZE':
            return 25
          default:
            return undefined
        }
      }),
    }

    const runner = new RouteVoiceReportTranscriptionRunner(
      reportRepository as never,
      storage,
      provider,
      audit as never,
      events as never,
      configService as never,
    )

    return { runner, reports, storage, provider, audit, events, reportRepository }
  }

  async function flushJobs(): Promise<void> {
    for (let i = 0; i < 10; i += 1) {
      await new Promise<void>(resolve => {
        setImmediate(resolve)
      })
    }
  }

  it('claims PENDING with a lease and completes successfully', async () => {
    const report = buildReport()
    const { runner, reports, provider, audit, events } = buildRunner({
      reports: [report],
    })
    runner.schedule(report.id)
    await flushJobs()

    expect(provider.calls).toHaveLength(1)
    expect(reports[0].transcription?.status).toBe(
      RouteVoiceTranscriptionStatus.COMPLETED,
    )
    expect(reports[0].transcription?.text).toBe('Fake transcript')
    expect(reports[0].status).toBe(RouteVoiceReportStatus.AVAILABLE)
    expect(reports[0].mimeType).toBe('audio/webm')
    expect(reports[0].sizeBytes).toBe(report.sizeBytes)
    expect(audit.recordTranscriptionCompleted).toHaveBeenCalledTimes(1)
    const completedCalls = events.publishTranscriptionUpdate.mock.calls as Array<
      [
        {
          eventType: string
          transcriptionStatus: RouteVoiceTranscriptionStatus
        },
      ]
    >
    const payload = completedCalls.find(
      call =>
        call[0].eventType === 'ROUTE_VOICE_REPORT_TRANSCRIPTION_COMPLETED',
    )?.[0]
    expect(payload).toEqual(
      expect.objectContaining({
        transcriptionStatus: RouteVoiceTranscriptionStatus.COMPLETED,
        eventType: 'ROUTE_VOICE_REPORT_TRANSCRIPTION_COMPLETED',
      }),
    )
    expect(payload).not.toHaveProperty('transcript')
    expect(JSON.stringify(payload)).not.toContain('Fake transcript')
  })

  it('retries transient failures and fails permanently after max attempts', async () => {
    const report = buildReport()
    const provider = new FakeRouteVoiceTranscriptionProvider()
    provider.setDefaultBehaviour({ kind: 'timeout' })
    const { runner, reports, audit } = buildRunner({
      reports: [report],
      provider,
      maxAttempts: 2,
    })

    // Force immediate retries by stubbing setTimeout.
    const realSetTimeout = global.setTimeout
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn()
      return 0 as unknown as NodeJS.Timeout
    }))

    runner.schedule(report.id)
    await flushJobs()

    expect(reports[0].transcription?.status).toBe(
      RouteVoiceTranscriptionStatus.FAILED,
    )
    expect(reports[0].transcription?.failureCode).toBe(
      RouteVoiceTranscriptionFailureCode.PROVIDER_TIMEOUT,
    )
    expect(reports[0].transcription?.attemptCount).toBeGreaterThanOrEqual(2)
    expect(reports[0].status).toBe(RouteVoiceReportStatus.AVAILABLE)
    expect(audit.recordTranscriptionFailed).toHaveBeenCalledTimes(1)

    ;(global.setTimeout as unknown as jest.Mock).mockRestore?.()
    global.setTimeout = realSetTimeout
  })

  it('does not auto-retry permanent unsupported audio failures', async () => {
    const report = buildReport()
    const provider = new FakeRouteVoiceTranscriptionProvider()
    provider.setDefaultBehaviour({ kind: 'unsupported_audio' })
    const { runner, reports, audit } = buildRunner({
      reports: [report],
      provider,
      maxAttempts: 3,
    })
    runner.schedule(report.id)
    await flushJobs()

    expect(reports[0].transcription?.status).toBe(
      RouteVoiceTranscriptionStatus.FAILED,
    )
    expect(reports[0].transcription?.attemptCount).toBe(1)
    expect(audit.recordTranscriptionFailed).toHaveBeenCalledTimes(1)
    expect(provider.calls).toHaveLength(1)
  })

  it('duplicate in-memory schedule invokes one claim/provider call', async () => {
    const report = buildReport()
    const { runner, provider } = buildRunner({ reports: [report] })
    runner.schedule(report.id)
    runner.schedule(report.id)
    runner.schedule(report.id)
    await flushJobs()
    expect(provider.calls).toHaveLength(1)
  })

  it('CAS prevents a second claim while PROCESSING lease is active', async () => {
    const report = buildReport()
    report.transcription!.status = RouteVoiceTranscriptionStatus.PROCESSING
    report.transcription!.processingLeaseId = 'lease-a'
    report.transcription!.processingLeaseExpiresAt = new Date(
      Date.now() + 60_000,
    )
    report.transcription!.attemptCount = 1
    const { runner, provider } = buildRunner({ reports: [report] })
    runner.schedule(report.id)
    await flushJobs()
    expect(provider.calls).toHaveLength(0)
  })

  it('stale worker cannot finalise after lease replacement', async () => {
    const report = buildReport()
    const { runner, reports, audit } = buildRunner({ reports: [report] })

    type RunnerInternals = {
      claimForProcessing: (
        id: string,
      ) => Promise<{ report: RouteVoiceReport; leaseId: string } | null>
      finaliseSuccess: (input: {
        report: RouteVoiceReport
        leaseId: string
        text: string
        detectedLocale: string | null
        confidence: number | null
        audioDurationSeconds: number | null
        providerRequestId: string | null
        attemptCount: number
      }) => Promise<void>
    }
    const internals = runner as unknown as RunnerInternals

    const claim = await internals.claimForProcessing(report.id)

    expect(claim).not.toBeNull()
    reports[0].transcription!.processingLeaseId = 'other-lease'

    await internals.finaliseSuccess({
      report: claim!.report,
      leaseId: claim!.leaseId,
      text: 'should-not-persist',
      detectedLocale: 'nl-NL',
      confidence: 0.5,
      audioDurationSeconds: 10,
      providerRequestId: 'x',
      attemptCount: 1,
    })

    expect(reports[0].transcription?.text).not.toBe('should-not-persist')
    expect(audit.recordTranscriptionCompleted).not.toHaveBeenCalled()
  })

  it('recovers expired PROCESSING leases and ignores active leases / permanent FAILED', async () => {
    const pending = buildReport({ _id: new ObjectId() })
    const stale = buildReport({ _id: new ObjectId() })
    stale.transcription!.status = RouteVoiceTranscriptionStatus.PROCESSING
    stale.transcription!.processingLeaseExpiresAt = new Date(
      Date.now() - 1_000,
    )
    stale.transcription!.processingLeaseId = 'old'
    stale.transcription!.attemptCount = 1

    const active = buildReport({ _id: new ObjectId() })
    active.transcription!.status = RouteVoiceTranscriptionStatus.PROCESSING
    active.transcription!.processingLeaseExpiresAt = new Date(
      Date.now() + 60_000,
    )
    active.transcription!.processingLeaseId = 'active'
    active.transcription!.attemptCount = 1

    const failed = buildReport({ _id: new ObjectId() })
    failed.transcription!.status = RouteVoiceTranscriptionStatus.FAILED
    failed.transcription!.failureCode =
      RouteVoiceTranscriptionFailureCode.NO_SPEECH
    failed.transcription!.attemptCount = 1

    const { runner, provider } = buildRunner({
      reports: [pending, stale, active, failed],
    })
    const scheduled = await runner.recoverStaleAndPendingWork()
    expect(scheduled).toBe(2)
    await flushJobs()
    expect(provider.calls.length).toBeGreaterThanOrEqual(2)
    expect(
      provider.calls.every(
        call =>
          call.correlationId === pending.id ||
          call.correlationId === stale.id,
      ),
    ).toBe(true)
  })

  it('missing Blob results in safe permanent failure while audio metadata remains', async () => {
    const report = buildReport()
    const { runner, reports, storage } = buildRunner({ reports: [report] })
    storage.clear()
    runner.schedule(report.id)
    await flushJobs()
    expect(reports[0].transcription?.status).toBe(
      RouteVoiceTranscriptionStatus.FAILED,
    )
    expect(reports[0].transcription?.failureCode).toBe(
      RouteVoiceTranscriptionFailureCode.AUDIO_MISSING,
    )
    expect(reports[0].status).toBe(RouteVoiceReportStatus.AVAILABLE)
    expect(reports[0].blobName).toBe(report.blobName)
  })

  it('ADMIN can retry FAILED; courier cannot; COMPLETED rejected', async () => {
    const failed = buildReport()
    failed.transcription!.status = RouteVoiceTranscriptionStatus.FAILED
    failed.transcription!.failureCode =
      RouteVoiceTranscriptionFailureCode.PROVIDER_TIMEOUT
    failed.transcription!.attemptCount = 3

    const { runner, reports, audit } = buildRunner({ reports: [failed] })

    await expect(
      runner.retryTranscriptionForAdmin(
        courierActor,
        routeId,
        failed.id,
      ),
    ).rejects.toBeInstanceOf(RouteVoiceTranscriptionForbiddenException)

    const scheduleSpy = jest.spyOn(runner, 'schedule').mockImplementation(() => undefined)

    const result = await runner.retryTranscriptionForAdmin(
      adminActor,
      routeId,
      failed.id,
    )
    expect(result.transcriptionStatus).toBe('PENDING')
    expect(reports[0].transcription?.status).toBe(
      RouteVoiceTranscriptionStatus.PENDING,
    )
    expect(audit.recordTranscriptionRetried).toHaveBeenCalledTimes(1)

    // Idempotent while still PENDING
    const again = await runner.retryTranscriptionForAdmin(
      adminActor,
      routeId,
      failed.id,
    )
    expect(again.transcriptionStatus).toBe('PENDING')
    expect(audit.recordTranscriptionRetried).toHaveBeenCalledTimes(1)

    scheduleSpy.mockRestore()
    runner.schedule(failed.id)
    await flushJobs()

    reports[0].transcription!.status = RouteVoiceTranscriptionStatus.COMPLETED
    await expect(
      runner.retryTranscriptionForAdmin(adminActor, routeId, failed.id),
    ).rejects.toBeInstanceOf(RouteVoiceTranscriptionAlreadyCompletedException)
  })

  it('enforces format compatibility without conversion', () => {
    expect(
      assessRouteVoiceTranscriptionCompatibility({
        mimeType: 'audio/webm',
        fileExtension: 'webm',
      }).outcome,
    ).toBe('submit_original')
    expect(
      assessRouteVoiceTranscriptionCompatibility({
        mimeType: 'audio/ogg',
        fileExtension: 'ogg',
      }).outcome,
    ).toBe('submit_original')
    expect(
      assessRouteVoiceTranscriptionCompatibility({
        mimeType: 'audio/mp4',
        fileExtension: 'm4a',
      }).outcome,
    ).toBe('submit_original')
    expect(
      assessRouteVoiceTranscriptionCompatibility({
        mimeType: 'audio/wav',
        fileExtension: 'wav',
      }).outcome,
    ).toBe('unsupported')
  })

  it('bounded concurrency does not exceed configured limit', async () => {
    const reports = [buildReport(), buildReport(), buildReport()]
    const provider = new FakeRouteVoiceTranscriptionProvider()
    let inFlight = 0
    let maxInFlight = 0
    const original = provider.transcribe.bind(provider)
    provider.transcribe = async input => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise<void>(resolve => {
        setImmediate(resolve)
      })
      inFlight -= 1
      return original(input)
    }

    const { runner } = buildRunner({
      reports,
      provider,
      concurrency: 2,
    })
    for (const report of reports) {
      runner.schedule(report.id)
    }
    await flushJobs()
    expect(maxInFlight).toBeLessThanOrEqual(2)
  })
})
