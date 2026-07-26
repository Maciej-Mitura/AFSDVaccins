import { Injectable, Logger } from '@nestjs/common'
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
} from 'pdf-lib'

import {
  DELIVERY_MANIFEST_APPLICATION_NAME,
  DELIVERY_MANIFEST_MAX_PDF_BYTES,
} from './delivery-manifest.constants'
import {
  DeliveryManifestGenerationFailedException,
  DeliveryManifestTooLargeException,
} from './delivery-manifest.exceptions'
import {
  getDeliveryManifestLabels,
  type DeliveryManifestLabels,
} from './delivery-manifest.labels.en'
import type {
  ManifestOrderData,
  ManifestStopData,
  RouteManifestData,
} from './delivery-manifest.types'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const LINE_HEIGHT = 14
const SECTION_GAP = 16
const QR_DISPLAY_SIZE = 96

type DrawContext = {
  doc: PDFDocument
  page: PDFPage
  font: PDFFont
  fontBold: PDFFont
  labels: DeliveryManifestLabels
  y: number
}

/**
 * English PDF renderer for delivery manifests (Phase 29A).
 * Uses pdf-lib + StandardFonts — no custom font files, no Chromium.
 */
@Injectable()
export class DeliveryManifestPdfService {
  private readonly logger = new Logger(DeliveryManifestPdfService.name)

  async render(manifest: RouteManifestData): Promise<Buffer> {
    try {
      const labels = getDeliveryManifestLabels()
      const doc = await PDFDocument.create()
      doc.setTitle(labels.title)
      doc.setSubject(labels.subject)
      doc.setCreator(DELIVERY_MANIFEST_APPLICATION_NAME)
      doc.setProducer(DELIVERY_MANIFEST_APPLICATION_NAME)
      doc.setCreationDate(manifest.generatedAt)
      doc.setModificationDate(manifest.generatedAt)

      const font = await doc.embedFont(StandardFonts.Helvetica)
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

      const ctx: DrawContext = {
        doc,
        page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
        font,
        fontBold,
        labels,
        y: PAGE_HEIGHT - MARGIN,
      }

      this.drawCover(ctx, manifest)

      for (const stop of manifest.stops) {
        await this.drawStopSection(ctx, manifest, stop)
      }

      this.drawPageNumbers(ctx)

      const bytes = await doc.save()
      if (bytes.byteLength > DELIVERY_MANIFEST_MAX_PDF_BYTES) {
        throw new DeliveryManifestTooLargeException()
      }

      return Buffer.from(bytes)
    } catch (error) {
      if (
        error instanceof DeliveryManifestGenerationFailedException ||
        error instanceof DeliveryManifestTooLargeException
      ) {
        throw error
      }
      this.logger.error(
        'PDF generation failed.',
        error instanceof Error ? error.message : 'unknown',
      )
      throw new DeliveryManifestGenerationFailedException()
    }
  }

  private drawCover(ctx: DrawContext, manifest: RouteManifestData): void {
    const { labels } = ctx
    this.ensureSpace(ctx, 180)

    this.drawText(ctx, labels.title, {
      size: 20,
      bold: true,
      gapAfter: 8,
    })

    if (manifest.routeCancelled) {
      this.drawText(ctx, labels.routeCancelledNotice, {
        size: 11,
        bold: true,
        gapAfter: 10,
      })
    }

    const summaryTitle =
      manifest.scope === 'STOP' ? labels.stopSummaryHeading : labels.summaryHeading
    this.drawText(ctx, summaryTitle, {
      size: 13,
      bold: true,
      gapAfter: 6,
    })

    this.drawKeyValue(ctx, labels.routeDate, manifest.routeDate)
    this.drawKeyValue(ctx, labels.routeStatus, manifest.routeStatus)
    this.drawKeyValue(
      ctx,
      labels.generatedAt,
      formatIsoTimestamp(manifest.generatedAt),
    )

    if (manifest.assignedCourier) {
      this.drawKeyValue(
        ctx,
        labels.assignedCourier,
        manifest.assignedCourier.displayName,
      )
    } else if (manifest.scope === 'ROUTE') {
      this.drawKeyValue(ctx, labels.assignedCourier, labels.notAssigned)
    }

    this.drawKeyValue(ctx, labels.stopCount, String(manifest.stopCount))
    this.drawKeyValue(ctx, labels.orderCount, String(manifest.totalOrderCount))
    this.drawKeyValue(ctx, labels.lineCount, String(manifest.totalLineCount))
    this.drawKeyValue(
      ctx,
      labels.itemQuantity,
      String(manifest.totalItemQuantity),
    )

    ctx.y -= SECTION_GAP
  }

  private async drawStopSection(
    ctx: DrawContext,
    manifest: RouteManifestData,
    stop: ManifestStopData,
  ): Promise<void> {
    const { labels } = ctx
    this.ensureSpace(ctx, 100)

    this.drawHorizontalRule(ctx)
    this.drawText(
      ctx,
      labels.stopHeading.replace('{sequence}', String(stop.sequence)),
      { size: 14, bold: true, gapAfter: 6 },
    )

    this.drawKeyValue(ctx, labels.pharmacy, stop.pharmacy.name)
    this.drawKeyValue(
      ctx,
      labels.address,
      `${stop.pharmacy.addressLine}, ${stop.pharmacy.postalCode} ${stop.pharmacy.city}`.trim(),
    )
    this.drawKeyValue(ctx, labels.city, stop.pharmacy.city)
    this.drawKeyValue(
      ctx,
      labels.stopStatus,
      stopStatusLabel(labels, stop.stopStatus),
    )
    this.drawKeyValue(
      ctx,
      labels.stopOrders,
      String(stop.totals.orderCount),
    )
    this.drawKeyValue(
      ctx,
      labels.stopTotals,
      `${stop.totals.lineCount} lines / ${stop.totals.itemQuantity} items`,
    )

    this.drawArrivalBlock(ctx, stop)
    this.drawDeliveryProofBlock(ctx, stop)
    await this.drawQrBlock(ctx, stop)
    this.drawOrderTables(ctx, stop)

    void manifest
  }

  private drawArrivalBlock(ctx: DrawContext, stop: ManifestStopData): void {
    const { labels } = ctx
    this.ensureSpace(ctx, 70)
    this.drawText(ctx, labels.arrivalHeading, {
      size: 11,
      bold: true,
      gapAfter: 4,
    })

    if (!stop.arrival) {
      this.drawKeyValue(ctx, labels.arrivalClientTime, labels.pendingValue)
      this.drawKeyValue(ctx, labels.arrivalServerTime, labels.pendingValue)
      return
    }

    this.drawKeyValue(
      ctx,
      labels.arrivalClientTime,
      formatIsoTimestamp(stop.arrival.clientArrivedAt),
    )
    this.drawKeyValue(
      ctx,
      labels.arrivalServerTime,
      formatIsoTimestamp(stop.arrival.recordedAt),
    )
    this.drawKeyValue(
      ctx,
      labels.arrivalCourier,
      stop.arrival.courierDisplayName ?? labels.pendingValue,
    )

    if (stop.stopStatus === 'arrived') {
      this.drawText(ctx, labels.arrivalPendingDelivery, {
        size: 10,
        gapAfter: 4,
      })
    }
  }

  private drawDeliveryProofBlock(
    ctx: DrawContext,
    stop: ManifestStopData,
  ): void {
    const { labels } = ctx
    this.ensureSpace(ctx, 80)
    this.drawText(ctx, labels.deliveryProofHeading, {
      size: 11,
      bold: true,
      gapAfter: 4,
    })

    if (!stop.deliveryProof) {
      this.drawKeyValue(ctx, labels.deliveryStatus, labels.pendingValue)
      this.drawKeyValue(ctx, labels.deliveredAt, labels.pendingValue)
      return
    }

    this.drawKeyValue(ctx, labels.deliveryStatus, labels.deliveryConfirmed)
    this.drawKeyValue(
      ctx,
      labels.deliveredAt,
      formatIsoTimestamp(stop.deliveryProof.deliveredAt),
    )
    this.drawKeyValue(
      ctx,
      labels.deliveredBy,
      stop.deliveryProof.courierDisplayName ?? labels.pendingValue,
    )
    this.drawKeyValue(ctx, labels.proofMethod, labels.proofMethodQr)
    this.drawKeyValue(
      ctx,
      labels.associatedOrders,
      String(stop.deliveryProof.associatedOrderCount),
    )
    this.drawKeyValue(
      ctx,
      labels.recipientCity,
      stop.deliveryProof.recipientCity || labels.pendingValue,
    )
    if (stop.deliveryProof.confirmationReference) {
      this.drawKeyValue(
        ctx,
        labels.confirmationReference,
        stop.deliveryProof.confirmationReference,
      )
    }
  }

  private async drawQrBlock(
    ctx: DrawContext,
    stop: ManifestStopData,
  ): Promise<void> {
    const { labels } = ctx
    this.ensureSpace(ctx, QR_DISPLAY_SIZE + 40)
    this.drawText(ctx, labels.qrHeading, {
      size: 11,
      bold: true,
      gapAfter: 4,
    })

    switch (stop.qr.state) {
      case 'ACTIVE': {
        if (!stop.qr.pngBytes) {
          this.drawText(ctx, labels.qrUnavailable, { size: 10, gapAfter: 6 })
          return
        }
        this.drawText(ctx, labels.qrActive, { size: 10, gapAfter: 4 })
        const image = await ctx.doc.embedPng(stop.qr.pngBytes)
        this.drawImage(ctx, image, QR_DISPLAY_SIZE, QR_DISPLAY_SIZE)
        ctx.y -= 8
        return
      }
      case 'CONSUMED':
        this.drawText(ctx, labels.qrConsumed, { size: 10, gapAfter: 6 })
        return
      case 'OMITTED_CANCELLED':
        this.drawText(ctx, labels.qrOmittedCancelled, { size: 10, gapAfter: 6 })
        return
      case 'OMITTED_ROUTE_INACTIVE':
        this.drawText(ctx, labels.qrOmittedInactive, { size: 10, gapAfter: 6 })
        return
      case 'UNAVAILABLE':
      default:
        this.drawText(ctx, labels.qrUnavailable, { size: 10, gapAfter: 6 })
    }
  }

  private drawOrderTables(ctx: DrawContext, stop: ManifestStopData): void {
    const { labels } = ctx
    this.ensureSpace(ctx, 40)
    this.drawText(ctx, labels.stopOrders, {
      size: 11,
      bold: true,
      gapAfter: 6,
    })

    if (stop.orders.length === 0) {
      this.drawText(ctx, labels.pendingValue, { size: 10, gapAfter: 6 })
      return
    }

    for (const order of stop.orders) {
      this.drawOrderGroup(ctx, order)
    }
  }

  private drawOrderGroup(ctx: DrawContext, order: ManifestOrderData): void {
    const { labels } = ctx
    this.ensureSpace(ctx, 36 + order.lines.length * LINE_HEIGHT)

    this.drawText(
      ctx,
      `${labels.orderReference}: ${shortOrderRef(order.orderId)}  ·  ${labels.orderStatus}: ${order.orderStatus}`,
      { size: 10, bold: true, gapAfter: 2 },
    )

    // Header row
    this.drawTableRow(
      ctx,
      [labels.vaccine, labels.quantity],
      [CONTENT_WIDTH - 70, 70],
      true,
    )

    for (const line of order.lines) {
      this.ensureSpace(ctx, LINE_HEIGHT + 2)
      this.drawTableRow(
        ctx,
        [line.vaccineName, String(line.quantity)],
        [CONTENT_WIDTH - 70, 70],
        false,
      )
    }

    ctx.y -= 8
  }

  private drawTableRow(
    ctx: DrawContext,
    cells: string[],
    widths: number[],
    bold: boolean,
  ): void {
    let x = MARGIN
    const size = 9
    const font = bold ? ctx.fontBold : ctx.font
    for (let i = 0; i < cells.length; i++) {
      const text = truncateToWidth(font, cells[i] ?? '', widths[i] ?? 100, size)
      ctx.page.drawText(text, {
        x,
        y: ctx.y - size,
        size,
        font,
        color: rgb(0.1, 0.1, 0.1),
      })
      x += widths[i] ?? 100
    }
    ctx.y -= LINE_HEIGHT
  }

  private drawKeyValue(
    ctx: DrawContext,
    key: string,
    value: string,
  ): void {
    this.ensureSpace(ctx, LINE_HEIGHT + 2)
    const label = `${key}: `
    const size = 10
    ctx.page.drawText(label, {
      x: MARGIN,
      y: ctx.y - size,
      size,
      font: ctx.fontBold,
      color: rgb(0.15, 0.15, 0.15),
    })
    const labelWidth = ctx.fontBold.widthOfTextAtSize(label, size)
    const remaining = CONTENT_WIDTH - labelWidth
    const text = truncateToWidth(ctx.font, value, remaining, size)
    ctx.page.drawText(text, {
      x: MARGIN + labelWidth,
      y: ctx.y - size,
      size,
      font: ctx.font,
      color: rgb(0.1, 0.1, 0.1),
    })
    ctx.y -= LINE_HEIGHT
  }

  private drawText(
    ctx: DrawContext,
    text: string,
    options: { size: number; bold?: boolean; gapAfter?: number },
  ): void {
    this.ensureSpace(ctx, options.size + (options.gapAfter ?? 4) + 4)
    const font = options.bold ? ctx.fontBold : ctx.font
    const safe = truncateToWidth(font, text, CONTENT_WIDTH, options.size)
    ctx.page.drawText(safe, {
      x: MARGIN,
      y: ctx.y - options.size,
      size: options.size,
      font,
      color: rgb(0.05, 0.05, 0.05),
    })
    ctx.y -= options.size + (options.gapAfter ?? 4)
  }

  private drawImage(
    ctx: DrawContext,
    image: PDFImage,
    width: number,
    height: number,
  ): void {
    this.ensureSpace(ctx, height + 8)
    ctx.page.drawImage(image, {
      x: MARGIN,
      y: ctx.y - height,
      width,
      height,
    })
    ctx.y -= height
  }

  private drawHorizontalRule(ctx: DrawContext): void {
    this.ensureSpace(ctx, 12)
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
      thickness: 0.75,
      color: rgb(0.7, 0.7, 0.7),
    })
    ctx.y -= 10
  }

  private ensureSpace(ctx: DrawContext, needed: number): void {
    if (ctx.y - needed < MARGIN + 24) {
      ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      ctx.y = PAGE_HEIGHT - MARGIN
    }
  }

  private drawPageNumbers(ctx: DrawContext): void {
    const pages = ctx.doc.getPages()
    const size = 9
    pages.forEach((page, index) => {
      const label = ctx.labels.page.replace('{page}', String(index + 1))
      const width = ctx.font.widthOfTextAtSize(label, size)
      page.drawText(label, {
        x: PAGE_WIDTH - MARGIN - width,
        y: MARGIN / 2,
        size,
        font: ctx.font,
        color: rgb(0.4, 0.4, 0.4),
      })
    })
  }
}

function stopStatusLabel(
  labels: DeliveryManifestLabels,
  status: ManifestStopData['stopStatus'],
): string {
  switch (status) {
    case 'arrived':
      return labels.stopStatusArrived
    case 'delivered':
      return labels.stopStatusDelivered
    default:
      return labels.stopStatusPending
  }
}

function formatIsoTimestamp(value: Date): string {
  return value.toISOString()
}

function shortOrderRef(orderId: string): string {
  const cleaned = orderId.replace(/[^a-fA-F0-9]/g, '')
  if (cleaned.length >= 8) {
    return cleaned.slice(-8).toLowerCase()
  }
  return orderId.slice(0, 12)
}

function truncateToWidth(
  font: PDFFont,
  text: string,
  maxWidth: number,
  size: number,
): string {
  const safe = sanitisePdfText(text)
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) {
    return safe
  }
  let truncated = safe
  while (truncated.length > 1) {
    truncated = truncated.slice(0, -1)
    const candidate = `${truncated}…`
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      return candidate
    }
  }
  return '…'
}

/** Strip characters outside WinAnsi / standard PDF font range. */
function sanitisePdfText(value: string): string {
  let cleaned = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    const isC0Control =
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31)
    if (isC0Control) {
      continue
    }
    const isWinAnsi =
      (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)
    cleaned += isWinAnsi ? char : '?'
  }
  return cleaned
}
