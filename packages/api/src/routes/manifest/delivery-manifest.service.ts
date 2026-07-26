import { Injectable, Logger } from '@nestjs/common'

import { User } from '../../user/user.entity'
import { DeliveryManifestAuditService } from './delivery-manifest-audit.service'
import {
  DELIVERY_MANIFEST_MAX_PDF_BYTES,
} from './delivery-manifest.constants'
import {
  DeliveryManifestGenerationFailedException,
  DeliveryManifestTooLargeException,
} from './delivery-manifest.exceptions'
import {
  buildRouteManifestFilename,
  buildStopManifestFilename,
} from './delivery-manifest.filename'
import { DeliveryManifestDataService } from './delivery-manifest-data.service'
import { DeliveryManifestPdfService } from './delivery-manifest-pdf.service'
import type { DeliveryManifestPdfResult } from './delivery-manifest.types'

/**
 * Orchestrates authorised manifest build → PDF render → audit → download payload.
 * Preferred policy: generate PDF fully, write audit, then send response.
 */
@Injectable()
export class DeliveryManifestService {
  private readonly logger = new Logger(DeliveryManifestService.name)

  constructor(
    private readonly dataService: DeliveryManifestDataService,
    private readonly pdfService: DeliveryManifestPdfService,
    private readonly auditService: DeliveryManifestAuditService,
  ) {}

  async generateRouteManifestPdf(
    actor: User,
    routeId: string,
  ): Promise<DeliveryManifestPdfResult> {
    const manifest = await this.dataService.buildRouteManifest(actor, routeId)
    const pdfBytes = await this.renderBounded(manifest)
    const filename = buildRouteManifestFilename(
      manifest.routeDate,
      manifest.routeId,
    )

    await this.writeAudit({
      routeId: manifest.routeId,
      stopId: null,
      scope: 'ROUTE',
      actor,
      generatedAt: manifest.generatedAt,
    })

    return { pdfBytes, filename, manifest }
  }

  async generateStopManifestPdf(
    actor: User,
    routeId: string,
    stopId: string,
  ): Promise<DeliveryManifestPdfResult> {
    const manifest = await this.dataService.buildStopManifest(
      actor,
      routeId,
      stopId,
    )
    const pdfBytes = await this.renderBounded(manifest)
    const stopSequence = manifest.stops[0]?.sequence ?? 0
    const filename = buildStopManifestFilename(
      manifest.routeDate,
      manifest.routeId,
      stopSequence,
    )

    await this.writeAudit({
      routeId: manifest.routeId,
      stopId: manifest.stops[0]?.stopId ?? stopId,
      scope: 'STOP',
      actor,
      generatedAt: manifest.generatedAt,
    })

    return { pdfBytes, filename, manifest }
  }

  private async renderBounded(
    manifest: Awaited<
      ReturnType<DeliveryManifestDataService['buildRouteManifest']>
    >,
  ): Promise<Buffer> {
    const pdfBytes = await this.pdfService.render(manifest)
    if (pdfBytes.byteLength > DELIVERY_MANIFEST_MAX_PDF_BYTES) {
      throw new DeliveryManifestTooLargeException()
    }
    if (pdfBytes.byteLength < 5 || pdfBytes.subarray(0, 5).toString('utf8') !== '%PDF-') {
      throw new DeliveryManifestGenerationFailedException()
    }
    return pdfBytes
  }

  private async writeAudit(input: {
    routeId: string
    stopId: string | null
    scope: 'ROUTE' | 'STOP'
    actor: User
    generatedAt: Date
  }): Promise<void> {
    try {
      await this.auditService.record({
        routeId: input.routeId,
        stopId: input.stopId,
        scope: input.scope,
        actorUserId: input.actor._id.toString(),
        actorRole: input.actor.role,
        generatedAt: input.generatedAt,
      })
    } catch (error) {
      // Preferred: generate PDF fully, write audit, then send.
      // If audit fails after successful PDF creation, do not stream a silent
      // success without audit — fail the request safely.
      this.logger.error(
        'Manifest audit failed after PDF generation; refusing response.',
        error instanceof Error ? error.message : 'unknown',
      )
      throw new DeliveryManifestGenerationFailedException()
    }
  }
}
