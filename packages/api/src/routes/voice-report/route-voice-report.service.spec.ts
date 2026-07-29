import { createHash } from 'node:crypto'
import { ObjectId } from 'mongodb'

import { UserRole } from '../../user/user-role.enum'
import { RouteStatus } from '../route-status.enum'
import { FakeRouteVoiceReportStorageProvider } from './fake-route-voice-report-storage.provider'
import {
  buildIdempotencyFingerprint,
  generateLegacyRouteVoiceReportBlobName,
  generateRouteVoiceReportBlobName,
} from './route-voice-report-audio.validation'
import {
  ROUTE_VOICE_REPORT_MAX_REPORTS_PER_ROUTE,
  ROUTE_VOICE_REPORT_STALE_UPLOADING_MS,
} from './route-voice-report.constants'
import {
  RouteVoiceReportCreationFailedException,
  RouteVoiceReportForbiddenException,
  RouteVoiceReportIdempotencyConflictException,
  RouteVoiceReportLimitReachedException,
  RouteVoiceReportNotAvailableException,
  RouteVoiceReportNotFoundException,
  RouteVoiceReportRangeInvalidException,
  RouteVoiceReportRouteNotFoundException,
  RouteVoiceReportRouteNotInProgressException,
  RouteVoiceReportStopIdRequiredException,
  RouteVoiceReportStopNotFoundException,
  RouteVoiceReportStorageFailedException,
  RouteVoiceReportAudioEmptyException,
  RouteVoiceReportAudioRequiredException,
  RouteVoiceReportAudioSignatureInvalidException,
} from './route-voice-report.exceptions'
import { RouteVoiceReport } from './route-voice-report.entity'
import { RouteVoiceReportService } from './route-voice-report.service'
import { RouteVoiceReportStatus } from './route-voice-report-status.enum'

function webmFixture(extraBytes = 64): Buffer {
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.alloc(extraBytes, 0x01),
  ])
}

describe('RouteVoiceReportService', () => {
  const courierUserId = new ObjectId()
  const unrelatedCourierUserId = new ObjectId()
  const bezorgerProfileId = new ObjectId()
  const unrelatedProfileId = new ObjectId()
  const routeId = new ObjectId()
  const apothekerProfileId = new ObjectId()
  const stopId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const otherStopId = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'
  const clientUploadId = 'client-upload-id-001'

  const courierActor = {
    _id: courierUserId,
    role: UserRole.BEZORGER,
  } as never

  const adminActor = {
    _id: new ObjectId(),
    role: UserRole.ADMIN,
  } as never

  const pharmacistActor = {
    _id: new ObjectId(),
    role: UserRole.APOTHEKER,
  } as never

  const anonymousActor = {
    _id: new ObjectId(),
    role: undefined,
  } as never

  function buildStop(id = stopId, sequence = 1) {
    return {
      stopId: id,
      sequence,
      apothekerProfileId: apothekerProfileId.toString(),
      apothekerUserId: new ObjectId().toString(),
      pharmacyName: 'Apotheek Centrum',
      address: { street: 'Main', number: '1', postalCode: '1000', city: 'Brussels' },
      orderIds: ['order-1'],
      orderCount: 1,
      totalQuantity: 2,
      lines: [],
    }
  }

  function buildRoute(status: RouteStatus = RouteStatus.IN_PROGRESS) {
    return {
      _id: routeId,
      status,
      bezorgerProfileId,
      deliveryDate: '2026-07-26',
      stops: [buildStop(stopId, 1), buildStop(otherStopId, 2)],
    }
  }

  function sha256Hex(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex')
  }

  function fingerprintFor(bytes: Buffer, durationSeconds = 12): string {
    return buildIdempotencyFingerprint({
      mimeType: 'audio/webm',
      sizeBytes: bytes.length,
      durationSeconds,
      sha256: sha256Hex(bytes),
      selectedLocale: 'nl-NL',
    })
  }

  function buildAvailableReport(overrides?: Partial<RouteVoiceReport> & {
    _id?: ObjectId
  }): RouteVoiceReport {
    const id = overrides?._id ?? new ObjectId()
    const bytes = webmFixture()
    const blobName =
      overrides?.blobName ??
      generateRouteVoiceReportBlobName({
        routeId: routeId.toString(),
        stopId,
        reportId: id.toString(),
        extension: 'webm',
      })
    const now = new Date('2026-07-26T10:00:00.000Z')
    const report = {
      _id: id,
      routeId: routeId.toString(),
      stopId,
      apothekerProfileId: apothekerProfileId.toString(),
      bezorgerProfileId: bezorgerProfileId.toString(),
      recordedByUserId: courierUserId.toString(),
      sequenceNumber: 1,
      status: RouteVoiceReportStatus.AVAILABLE,
      blobName,
      containerName: 'route-voice-reports',
      mimeType: 'audio/webm',
      codec: 'opus',
      fileExtension: 'webm',
      sizeBytes: bytes.length,
      durationSeconds: 12,
      sha256: sha256Hex(bytes),
      clientRecordedAt: now,
      uploadedAt: now,
      selectedLocale: 'nl-NL',
      browserFormatLabel: 'audio/webm;codecs=opus',
      clientUploadId,
      idempotencyFingerprint: fingerprintFor(bytes),
      createdAt: now,
      updatedAt: now,
      ...overrides,
      get id() {
        return this._id.toString()
      },
    } as RouteVoiceReport
    return report
  }

  function buildService(deps?: {
    route?: ReturnType<typeof buildRoute> | null
    profileId?: ObjectId
    reports?: RouteVoiceReport[]
    failFinalisation?: boolean
    failFinalisationFind?: boolean
    auditInserted?: boolean
  }) {
    const route = deps?.route === undefined ? buildRoute() : deps.route
    const reports = [...(deps?.reports ?? [])]
    const storage = new FakeRouteVoiceReportStorageProvider()

    const deliveryRouteRepository = {
      findOne: jest.fn().mockImplementation(() => Promise.resolve(route)),
    }

    const reportRepository = {
      findOne: jest.fn().mockImplementation((opts: { where: Record<string, unknown> }) => {
        const where = opts?.where ?? {}
        const found = reports.find(report => {
          if (where._id) {
            return report._id.toString() === (where._id as ObjectId).toString()
          }
          return (
            report.recordedByUserId === where.recordedByUserId &&
            report.routeId === where.routeId &&
            report.clientUploadId === where.clientUploadId
          )
        })
        return Promise.resolve(found ?? null)
      }),
      find: jest.fn().mockImplementation((opts?: {
        where?: Record<string, unknown>
        order?: { sequenceNumber?: string }
        take?: number
      }) => {
        let result = reports.filter(report => {
          if (!opts?.where) {
            return true
          }
          return Object.entries(opts.where).every(([key, value]) => {
            return (report as unknown as Record<string, unknown>)[key] === value
          })
        })
        if (opts?.order?.sequenceNumber === 'DESC') {
          result = [...result].sort((a, b) => b.sequenceNumber - a.sequenceNumber)
        } else if (opts?.order?.sequenceNumber === 'ASC') {
          result = [...result].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
        }
        if (opts?.take) {
          result = result.slice(0, opts.take)
        }
        return Promise.resolve(result)
      }),
      save: jest.fn().mockImplementation((doc: RouteVoiceReport) => {
        const saved = {
          ...doc,
          get id() {
            return this._id.toString()
          },
        } as RouteVoiceReport
        reports.push(saved)
        return Promise.resolve(saved)
      }),
      updateOne: jest.fn().mockImplementation(
        (
          filter: { _id: ObjectId; status?: RouteVoiceReportStatus },
          update: { $set: Record<string, unknown> },
        ) => {
          if (
            deps?.failFinalisation &&
            update.$set.status === RouteVoiceReportStatus.AVAILABLE
          ) {
            return Promise.reject(new Error('mongo-finalisation-failed'))
          }
          const target = reports.find(
            report => report._id.toString() === filter._id.toString(),
          )
          if (!target) {
            return Promise.resolve({ modifiedCount: 0 })
          }
          if (filter.status && target.status !== filter.status) {
            return Promise.resolve({ modifiedCount: 0 })
          }
          Object.assign(target, update.$set)
          return Promise.resolve({ modifiedCount: 1 })
        },
      ),
      countBy: jest.fn().mockImplementation((where: Record<string, unknown>) => {
        const count = reports.filter(report =>
          Object.entries(where).every(([key, value]) => {
            return (report as unknown as Record<string, unknown>)[key] === value
          }),
        ).length
        return Promise.resolve(count)
      }),
    }

    // After successful updateOne to AVAILABLE, optionally poison findOne for finalisation check.
    if (deps?.failFinalisationFind) {
      let afterStore = false
      reportRepository.updateOne = jest.fn().mockImplementation(
        (
          filter: { _id: ObjectId; status?: RouteVoiceReportStatus },
          update: { $set: Record<string, unknown> },
        ) => {
          const target = reports.find(
            report => report._id.toString() === filter._id.toString(),
          )
          if (!target) {
            return Promise.resolve({ modifiedCount: 0 })
          }
          Object.assign(target, update.$set)
          afterStore = update.$set.status === RouteVoiceReportStatus.AVAILABLE
          return Promise.resolve({ modifiedCount: 1 })
        },
      )
      reportRepository.findOne = jest
        .fn()
        .mockImplementation(
          (opts: { where: Record<string, unknown> }): Promise<RouteVoiceReport | null> => {
            const where = opts.where ?? {}
            const found =
              reports.find(report => {
                if (where._id) {
                  return (
                    report._id.toString() ===
                    (where._id as ObjectId).toString()
                  )
                }
                return (
                  report.recordedByUserId === where.recordedByUserId &&
                  report.routeId === where.routeId &&
                  report.clientUploadId === where.clientUploadId
                )
              }) ?? null
            if (afterStore && found) {
              return Promise.resolve({
                ...found,
                status: RouteVoiceReportStatus.UPLOADING,
                get id() {
                  return this._id.toString()
                },
              } as RouteVoiceReport)
            }
            return Promise.resolve(found)
          },
        )
    }

    const auditRecordCreated = jest.fn().mockResolvedValue({
      inserted: deps?.auditInserted ?? true,
      existing: null,
    })
    const publishCreated = jest.fn().mockResolvedValue(undefined)

    const bezorgerProfileService = {
      findByUserId: jest.fn().mockImplementation((userId: string) => {
        if (userId === courierUserId.toString()) {
          return Promise.resolve({
            id: deps?.profileId ?? bezorgerProfileId,
            displayName: 'Jan Courier',
          })
        }
        if (userId === unrelatedCourierUserId.toString()) {
          return Promise.resolve({
            id: unrelatedProfileId,
            displayName: 'Other Courier',
          })
        }
        return Promise.resolve(null)
      }),
      findBezorgerProfileById: jest.fn().mockResolvedValue({
        id: bezorgerProfileId,
        displayName: 'Jan Courier',
      }),
    }

    const schedule = jest.fn()
    const service = new RouteVoiceReportService(
      deliveryRouteRepository as never,
      reportRepository as never,
      storage,
      bezorgerProfileService as never,
      { recordCreated: auditRecordCreated } as never,
      { publishCreated } as never,
      { schedule } as never,
    )

    return {
      service,
      storage,
      reports,
      deliveryRouteRepository,
      reportRepository,
      auditRecordCreated,
      publishCreated,
      schedule,
      bezorgerProfileService,
    }
  }

  const baseUploadInput = {
    audioBytes: webmFixture(),
    declaredMimeType: 'audio/webm;codecs=opus',
    clientRecordedAt: '2026-07-26T10:00:00.000Z',
    durationSeconds: 12,
    selectedLocale: 'nl-NL',
    clientUploadId,
    browserFormatLabel: 'audio/webm;codecs=opus',
    stopId,
  }

  it('assigned BEZORGER uploads successfully on IN_PROGRESS route', async () => {
    const { service, storage, reportRepository, auditRecordCreated, publishCreated } =
      buildService({})

    const result = await service.uploadForCourier(
      courierActor,
      routeId.toString(),
      baseUploadInput,
    )

    expect(result.status).toBe(RouteVoiceReportStatus.AVAILABLE)
    expect(result.routeId).toBe(routeId.toString())
    expect(result.sequenceNumber).toBe(1)
    expect(result.canPlayAudio).toBe(true)
    expect(result.mimeType).toBe('audio/webm')
    expect(result.sizeBytes).toBe(baseUploadInput.audioBytes.length)
    expect(result).not.toHaveProperty('blobName')
    expect(result).not.toHaveProperty('containerName')
    expect(result).not.toHaveProperty('sha256')
    expect(result).not.toHaveProperty('recordedByUserId')
    expect(JSON.stringify(result)).not.toMatch(/blob\.core\.windows\.net|azure|sas=/i)

    const savedReports = (
      reportRepository.save as jest.MockedFunction<
        (doc: RouteVoiceReport) => Promise<RouteVoiceReport>
      >
    ).mock.calls.map(call => call[0])
    expect(savedReports).toHaveLength(1)
    const saved = savedReports[0]
    expect(saved.sha256).toBe(sha256Hex(baseUploadInput.audioBytes))
    expect(saved.stopId).toBe(stopId)
    expect(saved.apothekerProfileId).toBe(apothekerProfileId.toString())
    expect(saved.blobName).toMatch(
      new RegExp(
        `^route-voice-reports/${routeId.toString()}/stops/${stopId}/[a-f0-9]{24}/audio\\.webm$`,
      ),
    )
    expect(saved.blobName.toLowerCase()).not.toContain('jan')
    expect(saved.blobName.toLowerCase()).not.toContain('courier')
    expect(saved.blobName.toLowerCase()).not.toContain('apotheek')
    expect(storage.has(saved.blobName)).toBe(true)
    const storedMeta = storage.getMetadata?.(saved.blobName)
    expect(storedMeta).toBeDefined()
    expect(Object.keys(storedMeta!).sort()).toEqual(
      ['reportid', 'routeid', 'sha256prefix', 'stopid'].sort(),
    )
    expect(storedMeta!.routeid).toBe(routeId.toString())
    expect(storedMeta!.stopid).toBe(stopId)
    expect(storedMeta!.reportid).toBe(
      typeof saved.id === 'string' ? saved.id : String(saved._id),
    )
    expect(storedMeta!.sha256prefix).toBe(saved.sha256.slice(0, 16))
    expect(storedMeta!.sha256prefix).toMatch(/^[a-f0-9]{16}$/)
    expect(auditRecordCreated).toHaveBeenCalledTimes(1)
    expect(publishCreated).toHaveBeenCalledTimes(1)
  })

  it('requires stopId for new uploads', async () => {
    const { service } = buildService({})
    await expect(
      service.uploadForCourier(courierActor, routeId.toString(), {
        ...baseUploadInput,
        stopId: '',
      }),
    ).rejects.toBeInstanceOf(RouteVoiceReportStopIdRequiredException)
  })

  it('rejects stop that does not belong to the route', async () => {
    const { service } = buildService({})
    await expect(
      service.uploadForCourier(courierActor, routeId.toString(), {
        ...baseUploadInput,
        stopId: 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee',
      }),
    ).rejects.toBeInstanceOf(RouteVoiceReportStopNotFoundException)
  })

  it('allows multiple reports on the same stop', async () => {
    const { service, reportRepository } = buildService({})
    await service.uploadForCourier(courierActor, routeId.toString(), {
      ...baseUploadInput,
      clientUploadId: 'client-upload-id-aaa1',
    })
    await service.uploadForCourier(courierActor, routeId.toString(), {
      ...baseUploadInput,
      clientUploadId: 'client-upload-id-aaa2',
      audioBytes: webmFixture(80),
    })
    const saved = (
      reportRepository.save as jest.MockedFunction<
        (doc: RouteVoiceReport) => Promise<RouteVoiceReport>
      >
    ).mock.calls.map(call => call[0])
    expect(saved).toHaveLength(2)
    expect(saved.every(report => report.stopId === stopId)).toBe(true)
    expect(saved[0].sequenceNumber).not.toBe(saved[1].sequenceNumber)
  })

  it('lists legacy no-stopId reports without guessing a stop', async () => {
    const legacy = buildAvailableReport({
      stopId: null,
      apothekerProfileId: null,
      blobName: `route-voice-reports/${routeId.toString()}/${new ObjectId().toString()}/audio.webm`,
    })
    const { service } = buildService({ reports: [legacy] })
    const listed = await service.listForActor(adminActor, routeId.toString())
    expect(listed).toHaveLength(1)
    expect(listed[0].isLegacyRouteReport).toBe(true)
    expect(listed[0].stopId).toBeNull()
    expect(listed[0].pharmacyDisplayName).toBeNull()
    expect(listed[0].stopSequence).toBeNull()
  })

  it('Phase 36E2 legacy fixture: list, stream, and stale cleanup use old blob path', async () => {
    const legacyId = new ObjectId()
    const bytes = webmFixture(96)
    const legacyBlob = generateLegacyRouteVoiceReportBlobName({
      routeId: routeId.toString(),
      reportId: legacyId.toString(),
      extension: 'webm',
    })
    const legacy = buildAvailableReport({
      _id: legacyId,
      stopId: null,
      apothekerProfileId: null,
      blobName: legacyBlob,
      sizeBytes: bytes.length,
      sha256: sha256Hex(bytes),
      sequenceNumber: 7,
    })

    const listService = buildService({ reports: [legacy] }).service
    const listed = await listService.listForActor(
      adminActor,
      routeId.toString(),
    )
    expect(listed).toHaveLength(1)
    expect(listed[0].stopId).toBeNull()
    expect(listed[0].isLegacyRouteReport).toBe(true)
    expect(listed[0].pharmacyDisplayName).toBeNull()
    expect(listed[0].stopSequence).toBeNull()
    expect(listed[0]).not.toHaveProperty('blobName')
    expect(listed[0]).not.toHaveProperty('containerName')
    expect(JSON.stringify(listed[0])).not.toMatch(
      /blob\.core\.windows\.net|sas=|sha256/i,
    )

    const { service: streamService, storage } = buildService({
      reports: [legacy],
    })
    await storage.store({
      bytes,
      blobName: legacyBlob,
      mimeType: 'audio/webm',
    })
    const stream = await streamService.streamAudioForActor(
      adminActor,
      routeId.toString(),
      legacy.id,
      undefined,
    )
    expect(stream.statusCode).toBe(200)
    expect(stream.contentLength).toBe(bytes.length)
    expect(stream).not.toHaveProperty('blobName')

    const staleCreatedAt = new Date(
      Date.now() - ROUTE_VOICE_REPORT_STALE_UPLOADING_MS - 60_000,
    )
    const staleLegacy = buildAvailableReport({
      _id: new ObjectId(),
      stopId: null,
      apothekerProfileId: null,
      status: RouteVoiceReportStatus.UPLOADING,
      createdAt: staleCreatedAt,
      updatedAt: staleCreatedAt,
      clientUploadId: 'legacy-stale-upload-001',
      blobName: generateLegacyRouteVoiceReportBlobName({
        routeId: routeId.toString(),
        reportId: new ObjectId().toString(),
        extension: 'webm',
      }),
    })
    const {
      service: cleanupService,
      storage: cleanupStorage,
      reports,
    } = buildService({ reports: [staleLegacy] })
    await cleanupStorage.store({
      bytes: webmFixture(32),
      blobName: staleLegacy.blobName,
      mimeType: 'audio/webm',
    })
    expect(cleanupStorage.has(staleLegacy.blobName)).toBe(true)
    const cleaned = await cleanupService.recoverStaleUploadingReservations(
      new Date(),
    )
    expect(cleaned).toBe(1)
    expect(cleanupStorage.has(staleLegacy.blobName)).toBe(false)
    expect(reports[0].status).toBe(RouteVoiceReportStatus.UPLOAD_FAILED)
  })

  it('groups stop context for ADMIN list without exposing private blob fields', async () => {
    const stopReport = buildAvailableReport({ stopId, sequenceNumber: 1 })
    const { service } = buildService({ reports: [stopReport] })
    const listed = await service.listForActor(adminActor, routeId.toString())
    expect(listed[0].stopId).toBe(stopId)
    expect(listed[0].stopSequence).toBe(1)
    expect(listed[0].pharmacyDisplayName).toBe('Apotheek Centrum')
    expect(listed[0].isLegacyRouteReport).toBe(false)
    expect(listed[0]).not.toHaveProperty('blobName')
    expect(listed[0]).not.toHaveProperty('apothekerProfileId')
  })

  it('rejects ADMIN, APOTHEKER, anonymous, and unrelated BEZORGER on create', async () => {
    for (const actor of [adminActor, pharmacistActor, anonymousActor]) {
      const { service } = buildService({})
      await expect(
        service.uploadForCourier(actor, routeId.toString(), baseUploadInput),
      ).rejects.toBeInstanceOf(RouteVoiceReportForbiddenException)
    }

    const { service } = buildService({})
    const unrelated = {
      _id: unrelatedCourierUserId,
      role: UserRole.BEZORGER,
    } as never
    await expect(
      service.uploadForCourier(unrelated, routeId.toString(), baseUploadInput),
    ).rejects.toBeInstanceOf(RouteVoiceReportForbiddenException)
  })

  it('rejects ASSIGNED, COMPLETED, CANCELLED, and missing routes on create', async () => {
    for (const status of [
      RouteStatus.ASSIGNED,
      RouteStatus.COMPLETED,
      RouteStatus.CANCELLED,
    ]) {
      const { service } = buildService({ route: buildRoute(status) })
      await expect(
        service.uploadForCourier(courierActor, routeId.toString(), baseUploadInput),
      ).rejects.toBeInstanceOf(RouteVoiceReportRouteNotInProgressException)
    }

    const { service } = buildService({ route: null })
    await expect(
      service.uploadForCourier(courierActor, routeId.toString(), baseUploadInput),
    ).rejects.toBeInstanceOf(RouteVoiceReportRouteNotFoundException)

    await expect(
      service.uploadForCourier(courierActor, 'not-an-object-id', baseUploadInput),
    ).rejects.toBeInstanceOf(RouteVoiceReportRouteNotFoundException)
  })

  it('rejects missing, empty, and unsupported audio', async () => {
    const { service } = buildService({})

    await expect(
      service.uploadForCourier(courierActor, routeId.toString(), {
        ...baseUploadInput,
        audioBytes: undefined as unknown as Buffer,
      }),
    ).rejects.toBeInstanceOf(RouteVoiceReportAudioRequiredException)

    await expect(
      service.uploadForCourier(courierActor, routeId.toString(), {
        ...baseUploadInput,
        audioBytes: Buffer.alloc(0),
      }),
    ).rejects.toBeInstanceOf(RouteVoiceReportAudioEmptyException)

    await expect(
      service.uploadForCourier(courierActor, routeId.toString(), {
        ...baseUploadInput,
        audioBytes: Buffer.from('not-audio-magic'),
      }),
    ).rejects.toBeInstanceOf(RouteVoiceReportAudioSignatureInvalidException)
  })

  it('rejects the 21st report when the route is at the limit', async () => {
    const existing = Array.from(
      { length: ROUTE_VOICE_REPORT_MAX_REPORTS_PER_ROUTE },
      (_, index) =>
        buildAvailableReport({
          _id: new ObjectId(),
          sequenceNumber: index + 1,
          clientUploadId: `client-upload-id-${String(index + 1).padStart(3, '0')}`,
        }),
    )
    const { service, auditRecordCreated, publishCreated } = buildService({
      reports: existing,
    })

    await expect(
      service.uploadForCourier(courierActor, routeId.toString(), {
        ...baseUploadInput,
        clientUploadId: 'client-upload-id-021',
      }),
    ).rejects.toBeInstanceOf(RouteVoiceReportLimitReachedException)
    expect(auditRecordCreated).not.toHaveBeenCalled()
    expect(publishCreated).not.toHaveBeenCalled()
  })

  it('idempotent replay returns existing report without second audit/event', async () => {
    const bytes = webmFixture()
    const existing = buildAvailableReport({
      sizeBytes: bytes.length,
      sha256: sha256Hex(bytes),
      idempotencyFingerprint: fingerprintFor(bytes),
    })
    const { service, storage, auditRecordCreated, publishCreated, reportRepository } =
      buildService({ reports: [existing] })

    const result = await service.uploadForCourier(courierActor, routeId.toString(), {
      ...baseUploadInput,
      audioBytes: bytes,
    })

    expect(result.id).toBe(existing.id)
    expect(result.status).toBe(RouteVoiceReportStatus.AVAILABLE)
    expect(reportRepository.save).not.toHaveBeenCalled()
    expect(auditRecordCreated).not.toHaveBeenCalled()
    expect(publishCreated).not.toHaveBeenCalled()
    expect(storage.has(existing.blobName)).toBe(false)
  })

  it('rejects incompatible idempotency fingerprint', async () => {
    const existing = buildAvailableReport({
      idempotencyFingerprint: 'different-fingerprint',
    })
    const { service } = buildService({ reports: [existing] })

    await expect(
      service.uploadForCourier(courierActor, routeId.toString(), baseUploadInput),
    ).rejects.toBeInstanceOf(RouteVoiceReportIdempotencyConflictException)
  })

  it('blob upload failure leaves no AVAILABLE report', async () => {
    const { service, storage, reports, auditRecordCreated, publishCreated } =
      buildService({})
    storage.setFailNextStore(true)

    await expect(
      service.uploadForCourier(courierActor, routeId.toString(), baseUploadInput),
    ).rejects.toBeInstanceOf(RouteVoiceReportStorageFailedException)

    expect(reports.some(r => r.status === RouteVoiceReportStatus.AVAILABLE)).toBe(
      false,
    )
    expect(
      reports.some(r => r.status === RouteVoiceReportStatus.UPLOAD_FAILED),
    ).toBe(true)
    expect(auditRecordCreated).not.toHaveBeenCalled()
    expect(publishCreated).not.toHaveBeenCalled()
  })

  it('DB finalisation failure deletes the uploaded blob', async () => {
    const { service, storage, reports } = buildService({ failFinalisation: true })

    await expect(
      service.uploadForCourier(courierActor, routeId.toString(), baseUploadInput),
    ).rejects.toBeInstanceOf(RouteVoiceReportCreationFailedException)

    expect(reports.every(r => !storage.has(r.blobName))).toBe(true)
    expect(
      reports.some(r => r.status === RouteVoiceReportStatus.UPLOAD_FAILED),
    ).toBe(true)
  })

  it('recovers stale UPLOADING reservations', async () => {
    const staleCreatedAt = new Date(
      Date.now() - ROUTE_VOICE_REPORT_STALE_UPLOADING_MS - 60_000,
    )
    const stale = buildAvailableReport({
      status: RouteVoiceReportStatus.UPLOADING,
      createdAt: staleCreatedAt,
      updatedAt: staleCreatedAt,
      clientUploadId: 'stale-upload-001',
    })
    const { service, storage, reports } = buildService({ reports: [stale] })
    await storage.store({
      bytes: webmFixture(),
      blobName: stale.blobName,
      mimeType: 'audio/webm',
    })

    const cleaned = await service.recoverStaleUploadingReservations(new Date())

    expect(cleaned).toBe(1)
    expect(reports[0].status).toBe(RouteVoiceReportStatus.UPLOAD_FAILED)
    expect(storage.has(stale.blobName)).toBe(false)
  })

  it('lists AVAILABLE reports sorted by sequence and excludes storage fields', async () => {
    const second = buildAvailableReport({
      _id: new ObjectId(),
      sequenceNumber: 2,
      clientUploadId: 'client-upload-id-002',
      createdAt: new Date('2026-07-26T10:02:00.000Z'),
    })
    const first = buildAvailableReport({
      _id: new ObjectId(),
      sequenceNumber: 1,
      clientUploadId: 'client-upload-id-001',
      createdAt: new Date('2026-07-26T10:01:00.000Z'),
    })
    const uploading = buildAvailableReport({
      _id: new ObjectId(),
      sequenceNumber: 3,
      status: RouteVoiceReportStatus.UPLOADING,
      clientUploadId: 'client-upload-id-003',
    })
    const { service } = buildService({ reports: [second, first, uploading] })

    const listed = await service.listForActor(courierActor, routeId.toString())

    expect(listed.map(r => r.sequenceNumber)).toEqual([1, 2])
    expect(listed[0].recordedByDisplayName).toBe('Jan Courier')
    for (const item of listed) {
      expect(item).not.toHaveProperty('blobName')
      expect(item).not.toHaveProperty('containerName')
      expect(item).not.toHaveProperty('sha256')
      expect(item).not.toHaveProperty('recordedByUserId')
      expect(JSON.stringify(item)).not.toMatch(/blob\.core\.windows\.net|azure/i)
    }
  })

  it('ADMIN and assigned BEZORGER may list; unrelated and pharmacist may not', async () => {
    const report = buildAvailableReport()
    const { service } = buildService({ reports: [report] })

    await expect(
      service.listForActor(adminActor, routeId.toString()),
    ).resolves.toHaveLength(1)
    await expect(
      service.listForActor(courierActor, routeId.toString()),
    ).resolves.toHaveLength(1)

    await expect(
      service.listForActor(pharmacistActor, routeId.toString()),
    ).rejects.toBeInstanceOf(RouteVoiceReportForbiddenException)

    const unrelated = {
      _id: unrelatedCourierUserId,
      role: UserRole.BEZORGER,
    } as never
    await expect(
      service.listForActor(unrelated, routeId.toString()),
    ).rejects.toBeInstanceOf(RouteVoiceReportForbiddenException)
  })

  it('COMPLETED and CANCELLED routes remain readable for list/stream', async () => {
    const report = buildAvailableReport()
    const bytes = webmFixture()

    for (const status of [RouteStatus.COMPLETED, RouteStatus.CANCELLED]) {
      const { service, storage } = buildService({
        route: buildRoute(status),
        reports: [report],
      })
      await storage.store({
        bytes,
        blobName: report.blobName,
        mimeType: 'audio/webm',
      })

      await expect(
        service.listForActor(adminActor, routeId.toString()),
      ).resolves.toHaveLength(1)

      const stream = await service.streamAudioForActor(
        adminActor,
        routeId.toString(),
        report.id,
        undefined,
      )
      expect(stream.statusCode).toBe(200)
    }
  })

  it('streams 200 full, 206 partial, and rejects 416 / multi-range', async () => {
    const report = buildAvailableReport()
    const bytes = webmFixture(200)
    const { service, storage } = buildService({ reports: [report] })
    await storage.store({
      bytes,
      blobName: report.blobName,
      mimeType: 'audio/webm',
    })

    const full = await service.streamAudioForActor(
      courierActor,
      routeId.toString(),
      report.id,
      undefined,
    )
    expect(full.statusCode).toBe(200)
    expect(full.acceptRanges).toBe(true)
    expect(full.contentLength).toBe(bytes.length)
    expect(full.totalSize).toBe(bytes.length)

    const partial = await service.streamAudioForActor(
      courierActor,
      routeId.toString(),
      report.id,
      'bytes=0-9',
    )
    expect(partial.statusCode).toBe(206)
    expect(partial.contentLength).toBe(10)
    expect(partial.rangeStart).toBe(0)
    expect(partial.rangeEnd).toBe(9)

    await expect(
      service.streamAudioForActor(
        courierActor,
        routeId.toString(),
        report.id,
        `bytes=${bytes.length}-${bytes.length + 10}`,
      ),
    ).rejects.toBeInstanceOf(RouteVoiceReportRangeInvalidException)

    await expect(
      service.streamAudioForActor(
        courierActor,
        routeId.toString(),
        report.id,
        'bytes=0-10,20-30',
      ),
    ).rejects.toBeInstanceOf(RouteVoiceReportRangeInvalidException)
  })

  it('rejects streaming a non-AVAILABLE report', async () => {
    const report = buildAvailableReport({
      status: RouteVoiceReportStatus.UPLOADING,
    })
    const { service, storage } = buildService({ reports: [report] })
    await storage.store({
      bytes: webmFixture(),
      blobName: report.blobName,
      mimeType: 'audio/webm',
    })

    await expect(
      service.streamAudioForActor(
        courierActor,
        routeId.toString(),
        report.id,
        undefined,
      ),
    ).rejects.toBeInstanceOf(RouteVoiceReportNotAvailableException)
  })

  it('rejects streaming an unknown report id', async () => {
    const { service } = buildService({ reports: [] })
    await expect(
      service.streamAudioForActor(
        courierActor,
        routeId.toString(),
        new ObjectId().toString(),
        undefined,
      ),
    ).rejects.toBeInstanceOf(RouteVoiceReportNotFoundException)
  })
})
