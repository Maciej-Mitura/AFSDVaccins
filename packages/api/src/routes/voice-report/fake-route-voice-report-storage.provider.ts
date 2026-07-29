import { Injectable } from '@nestjs/common'
import { Readable } from 'node:stream'

import { assertValidRouteVoiceReportBlobName } from './route-voice-report-audio.validation'
import {
  RouteVoiceReportDownloadRangeInput,
  RouteVoiceReportDownloadResult,
  RouteVoiceReportStorageProvider,
  RouteVoiceReportStoreInput,
  RouteVoiceReportStoreResult,
} from './route-voice-report-storage.provider'
import {
  RouteVoiceReportNotFoundException,
  RouteVoiceReportStorageFailedException,
} from './route-voice-report.exceptions'
import { ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME } from './route-voice-report.constants'

/**
 * In-memory voice-report blob store for tests and local architecture validation.
 * Supports ranged reads without requiring Azure.
 */
@Injectable()
export class FakeRouteVoiceReportStorageProvider
  implements RouteVoiceReportStorageProvider
{
  readonly containerName: string
  private readonly blobs = new Map<
    string,
    { bytes: Buffer; mimeType: string; metadata?: Record<string, string> }
  >()
  private failNextStore = false
  private overwriteDisabled = true

  constructor(containerName = ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME) {
    this.containerName = containerName
  }

  store(
    input: RouteVoiceReportStoreInput,
  ): Promise<RouteVoiceReportStoreResult> {
    if (this.failNextStore) {
      this.failNextStore = false
      return Promise.reject(new RouteVoiceReportStorageFailedException())
    }

    const blobName = assertValidRouteVoiceReportBlobName(input.blobName)
    if (this.overwriteDisabled && this.blobs.has(blobName)) {
      return Promise.reject(new RouteVoiceReportStorageFailedException())
    }

    this.blobs.set(blobName, {
      bytes: Buffer.from(input.bytes),
      mimeType: input.mimeType,
      metadata: input.metadata ? { ...input.metadata } : undefined,
    })

    return Promise.resolve({ blobName, containerName: this.containerName })
  }

  delete(blobName: string): Promise<void> {
    const key = assertValidRouteVoiceReportBlobName(blobName)
    this.blobs.delete(key)
    return Promise.resolve()
  }

  exists(blobName: string): Promise<boolean> {
    const key = assertValidRouteVoiceReportBlobName(blobName)
    return Promise.resolve(this.blobs.has(key))
  }

  getProperties(
    blobName: string,
  ): Promise<{ contentLength: number; contentType: string } | null> {
    const key = assertValidRouteVoiceReportBlobName(blobName)
    const blob = this.blobs.get(key)
    if (!blob) {
      return Promise.resolve(null)
    }
    return Promise.resolve({
      contentLength: blob.bytes.length,
      contentType: blob.mimeType,
    })
  }

  downloadRange(
    input: RouteVoiceReportDownloadRangeInput,
  ): Promise<RouteVoiceReportDownloadResult> {
    const blobName = assertValidRouteVoiceReportBlobName(input.blobName)
    const blob = this.blobs.get(blobName)
    if (!blob) {
      return Promise.reject(new RouteVoiceReportNotFoundException())
    }

    const totalSize = blob.bytes.length
    const offset = input.offset
    const count =
      input.count === undefined ? totalSize - offset : input.count

    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset >= totalSize ||
      !Number.isInteger(count) ||
      count <= 0
    ) {
      return Promise.reject(new RouteVoiceReportStorageFailedException())
    }

    const rangeEnd = Math.min(offset + count - 1, totalSize - 1)
    const slice = blob.bytes.subarray(offset, rangeEnd + 1)

    return Promise.resolve({
      stream: Readable.from(slice),
      contentLength: slice.length,
      contentType: blob.mimeType,
      totalSize,
      rangeStart: offset,
      rangeEnd,
    })
  }

  /** Test helper */
  has(blobName: string): boolean {
    return this.blobs.has(blobName)
  }

  /** Test helper */
  getMetadata(blobName: string): Record<string, string> | undefined {
    return this.blobs.get(blobName)?.metadata
  }

  /** Test helper */
  getBytes(blobName: string): Buffer | undefined {
    return this.blobs.get(blobName)?.bytes
  }

  /** Test helper — force next store to fail once. */
  setFailNextStore(value: boolean): void {
    this.failNextStore = value
  }

  /** Test helper */
  clear(): void {
    this.blobs.clear()
  }
}
