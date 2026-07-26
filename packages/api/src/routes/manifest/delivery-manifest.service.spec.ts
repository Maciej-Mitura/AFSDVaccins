import { ObjectId } from 'mongodb'
import { StreamableFile } from '@nestjs/common'

import { User } from '../../user/user.entity'
import { UserRole } from '../../user/user-role.enum'
import { RouteStatus } from '../route-status.enum'
import { DeliveryManifestController } from './delivery-manifest.controller'
import { DeliveryManifestService } from './delivery-manifest.service'
import { DeliveryManifestGenerationFailedException } from './delivery-manifest.exceptions'
import {
  DELIVERY_MANIFEST_CACHE_CONTROL,
  DELIVERY_MANIFEST_CONTENT_TYPE,
} from './delivery-manifest.constants'
import type { DeliveryManifestPdfResult } from './delivery-manifest.types'

function adminUser(): User {
  return { _id: new ObjectId(), role: UserRole.ADMIN } as unknown as User
}

describe('DeliveryManifestService orchestration', () => {
  const dataService = {
    buildRouteManifest: jest.fn(),
    buildStopManifest: jest.fn(),
  }
  const pdfService = {
    render: jest.fn(),
  }
  const auditService = {
    record: jest.fn(),
  }

  let service: DeliveryManifestService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new DeliveryManifestService(
      dataService as never,
      pdfService as never,
      auditService as never,
    )
  })

  it('36: generation audit written once on success', async () => {
    const routeId = new ObjectId().toString()
    const manifest = {
      scope: 'ROUTE' as const,
      routeId,
      routeDate: '2026-07-26',
      routeStatus: RouteStatus.ASSIGNED,
      routeCancelled: false,
      generatedAt: new Date('2026-07-26T12:00:00.000Z'),
      generatedBy: { userId: 'u1', role: UserRole.ADMIN },
      assignedCourier: null,
      stopCount: 0,
      totalOrderCount: 0,
      totalLineCount: 0,
      totalItemQuantity: 0,
      stops: [],
    }
    dataService.buildRouteManifest.mockResolvedValue(manifest)
    pdfService.render.mockResolvedValue(Buffer.from('%PDF-1.4 fake'))
    auditService.record.mockResolvedValue(undefined)

    await service.generateRouteManifestPdf(adminUser(), routeId)

    expect(auditService.record).toHaveBeenCalledTimes(1)
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId,
        scope: 'ROUTE',
        stopId: null,
      }),
    )
  })

  it('37: failed generation writes no successful audit', async () => {
    dataService.buildRouteManifest.mockRejectedValue(
      new DeliveryManifestGenerationFailedException(),
    )

    await expect(
      service.generateRouteManifestPdf(adminUser(), new ObjectId().toString()),
    ).rejects.toBeInstanceOf(DeliveryManifestGenerationFailedException)

    expect(auditService.record).not.toHaveBeenCalled()
  })

  it('37b: failed PDF render writes no audit', async () => {
    dataService.buildRouteManifest.mockResolvedValue({
      scope: 'ROUTE',
      routeId: new ObjectId().toString(),
      routeDate: '2026-07-26',
      routeStatus: RouteStatus.ASSIGNED,
      routeCancelled: false,
      generatedAt: new Date(),
      generatedBy: { userId: 'u1', role: UserRole.ADMIN },
      assignedCourier: null,
      stopCount: 0,
      totalOrderCount: 0,
      totalLineCount: 0,
      totalItemQuantity: 0,
      stops: [],
    })
    pdfService.render.mockRejectedValue(
      new DeliveryManifestGenerationFailedException(),
    )

    await expect(
      service.generateRouteManifestPdf(adminUser(), new ObjectId().toString()),
    ).rejects.toBeInstanceOf(DeliveryManifestGenerationFailedException)
    expect(auditService.record).not.toHaveBeenCalled()
  })
})

describe('DeliveryManifestController response headers', () => {
  it('32-33: content type and cache headers are private/no-store PDF', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4 test-bytes')
    const result: DeliveryManifestPdfResult = {
      pdfBytes,
      filename: 'delivery-manifest-2026-07-26-route-99439011.pdf',
      manifest: {
        scope: 'ROUTE',
        routeId: new ObjectId().toString(),
        routeDate: '2026-07-26',
        routeStatus: RouteStatus.ASSIGNED,
        routeCancelled: false,
        generatedAt: new Date(),
        generatedBy: { userId: 'u', role: UserRole.ADMIN },
        assignedCourier: null,
        stopCount: 0,
        totalOrderCount: 0,
        totalLineCount: 0,
        totalItemQuantity: 0,
        stops: [],
      },
    }

    const manifestService = {
      generateRouteManifestPdf: jest.fn().mockResolvedValue(result),
      generateStopManifestPdf: jest.fn(),
    }
    const controller = new DeliveryManifestController(
      manifestService as never,
    )

    const headers: Record<string, string> = {}
    const res = {
      setHeader: (key: string, value: string) => {
        headers[key] = value
      },
    }

    const file = await controller.getRouteManifestPdf(
      result.manifest.routeId,
      adminUser(),
      res as never,
    )

    expect(file).toBeInstanceOf(StreamableFile)
    expect(headers['Content-Disposition']).toContain(result.filename)
    expect(DELIVERY_MANIFEST_CONTENT_TYPE).toBe('application/pdf')
    expect(DELIVERY_MANIFEST_CACHE_CONTROL).toBe('private, no-store')
  })
})
