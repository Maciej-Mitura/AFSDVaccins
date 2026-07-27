import { Readable } from 'node:stream'

export const ROUTE_VOICE_REPORT_STORAGE_PROVIDER = Symbol(
  'ROUTE_VOICE_REPORT_STORAGE_PROVIDER',
)

export type RouteVoiceReportStoreInput = {
  bytes: Buffer
  blobName: string
  mimeType: string
  metadata?: Record<string, string>
}

export type RouteVoiceReportStoreResult = {
  blobName: string
  containerName: string
}

export type RouteVoiceReportDownloadRangeInput = {
  blobName: string
  /** Inclusive start byte offset. */
  offset: number
  /** Number of bytes to read; omit for remainder. */
  count?: number
  /** Abort when the HTTP client disconnects. */
  abortSignal?: AbortSignal
}

export type RouteVoiceReportDownloadResult = {
  stream: Readable
  contentLength: number
  contentType: string
  totalSize: number
  /** Inclusive range start that was served (full file = 0). */
  rangeStart: number
  /** Inclusive range end that was served. */
  rangeEnd: number
}

export interface RouteVoiceReportStorageProvider {
  readonly containerName: string

  store(input: RouteVoiceReportStoreInput): Promise<RouteVoiceReportStoreResult>
  delete(blobName: string): Promise<void>
  /**
   * Stream blob bytes, optionally a single byte range.
   * Must not load the entire blob into memory solely to serve a range.
   */
  downloadRange(
    input: RouteVoiceReportDownloadRangeInput,
  ): Promise<RouteVoiceReportDownloadResult>
  exists(blobName: string): Promise<boolean>
  getProperties(
    blobName: string,
  ): Promise<{ contentLength: number; contentType: string } | null>
}
