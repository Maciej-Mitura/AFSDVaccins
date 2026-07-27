import {
  BlobServiceClient,
  ContainerClient,
  RestError,
} from '@azure/storage-blob'
import { Injectable } from '@nestjs/common'
import { Readable } from 'node:stream'

import { parseAzureStorageSharedKeyCredential } from '../../vaccine/image/azure-storage-connection'
import { assertValidRouteVoiceReportBlobName } from './route-voice-report-audio.validation'
import {
  isBlobAlreadyExistsError,
  mapRouteVoiceReportAzureStorageError,
} from './route-voice-report-storage.errors'
import {
  RouteVoiceReportDownloadRangeInput,
  RouteVoiceReportDownloadResult,
  RouteVoiceReportStorageProvider,
  RouteVoiceReportStoreInput,
  RouteVoiceReportStoreResult,
} from './route-voice-report-storage.provider'
import { RouteVoiceReportStorageFailedException } from './route-voice-report.exceptions'

const MAX_METADATA_ENTRIES = 8
const MAX_METADATA_KEY_LENGTH = 64
const MAX_METADATA_VALUE_LENGTH = 256
const METADATA_KEY_PATTERN = /^[a-zA-Z0-9_]+$/

export type AzureRouteVoiceReportStorageConfig = {
  connectionString: string
  containerName: string
}

/**
 * Private Azure Blob provider for route voice-report audio.
 * Container must already exist with anonymous access disabled.
 * Supports ranged download without buffering the full blob in memory.
 */
@Injectable()
export class AzureRouteVoiceReportStorageProvider
  implements RouteVoiceReportStorageProvider
{
  readonly containerName: string
  private readonly containerClient: ContainerClient
  private containerAccessVerified = false

  private constructor(
    containerClient: ContainerClient,
    containerName: string,
  ) {
    this.containerClient = containerClient
    this.containerName = containerName
  }

  static fromConfig(
    config: AzureRouteVoiceReportStorageConfig,
  ): AzureRouteVoiceReportStorageProvider {
    if (
      typeof config.containerName !== 'string' ||
      config.containerName.trim().length === 0
    ) {
      throw new RouteVoiceReportStorageFailedException()
    }

    // Validate shared-key credential shape without logging secrets.
    parseAzureStorageSharedKeyCredential(config.connectionString)

    const blobServiceClient = BlobServiceClient.fromConnectionString(
      config.connectionString,
    )
    const containerName = config.containerName.trim()
    const containerClient = blobServiceClient.getContainerClient(containerName)

    return new AzureRouteVoiceReportStorageProvider(
      containerClient,
      containerName,
    )
  }

  async store(
    input: RouteVoiceReportStoreInput,
  ): Promise<RouteVoiceReportStoreResult> {
    const blobName = assertValidRouteVoiceReportBlobName(input.blobName)

    if (!Buffer.isBuffer(input.bytes) || input.bytes.length === 0) {
      throw new RouteVoiceReportStorageFailedException()
    }

    await this.ensureContainerAccess()

    const blockBlob = this.containerClient.getBlockBlobClient(blobName)
    const metadata = sanitizeBlobMetadata(input.metadata)

    try {
      await blockBlob.uploadData(input.bytes, {
        blobHTTPHeaders: {
          blobContentType: input.mimeType.trim(),
        },
        metadata,
        conditions: {
          ifNoneMatch: '*',
        },
      })
    } catch (error) {
      if (isBlobAlreadyExistsError(error)) {
        throw new RouteVoiceReportStorageFailedException()
      }
      mapRouteVoiceReportAzureStorageError(error)
    }

    return { blobName, containerName: this.containerName }
  }

  async delete(blobName: string): Promise<void> {
    const key = assertValidRouteVoiceReportBlobName(blobName)
    await this.ensureContainerAccess()
    const blockBlob = this.containerClient.getBlockBlobClient(key)
    try {
      await blockBlob.deleteIfExists()
    } catch (error) {
      mapRouteVoiceReportAzureStorageError(error)
    }
  }

  async exists(blobName: string): Promise<boolean> {
    const key = assertValidRouteVoiceReportBlobName(blobName)
    await this.ensureContainerAccess()
    const blockBlob = this.containerClient.getBlockBlobClient(key)
    try {
      return await blockBlob.exists()
    } catch (error) {
      mapRouteVoiceReportAzureStorageError(error)
    }
  }

  async getProperties(
    blobName: string,
  ): Promise<{ contentLength: number; contentType: string } | null> {
    const key = assertValidRouteVoiceReportBlobName(blobName)
    await this.ensureContainerAccess()
    const blockBlob = this.containerClient.getBlockBlobClient(key)
    try {
      const props = await blockBlob.getProperties()
      return {
        contentLength: props.contentLength ?? 0,
        contentType: props.contentType ?? 'application/octet-stream',
      }
    } catch (error) {
      if (error instanceof RestError && error.statusCode === 404) {
        return null
      }
      mapRouteVoiceReportAzureStorageError(error)
    }
  }

  async downloadRange(
    input: RouteVoiceReportDownloadRangeInput,
  ): Promise<RouteVoiceReportDownloadResult> {
    const blobName = assertValidRouteVoiceReportBlobName(input.blobName)
    await this.ensureContainerAccess()

    const blockBlob = this.containerClient.getBlockBlobClient(blobName)

    let props: { contentLength?: number; contentType?: string }
    try {
      props = await blockBlob.getProperties()
    } catch (error) {
      mapRouteVoiceReportAzureStorageError(error)
    }

    const totalSize = props.contentLength ?? 0
    if (totalSize <= 0) {
      throw new RouteVoiceReportStorageFailedException()
    }

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
      throw new RouteVoiceReportStorageFailedException()
    }

    const rangeEnd = Math.min(offset + count - 1, totalSize - 1)
    const actualCount = rangeEnd - offset + 1

    try {
      const download = await blockBlob.download(offset, actualCount, {
        abortSignal: input.abortSignal,
      })

      const body = download.readableStreamBody
      if (!body) {
        throw new RouteVoiceReportStorageFailedException()
      }

      const stream =
        typeof (body as { pipe?: unknown }).pipe === 'function'
          ? (body as Readable)
          : Readable.from(body as AsyncIterable<Buffer>)

      return {
        stream,
        contentLength: actualCount,
        contentType: props.contentType ?? 'application/octet-stream',
        totalSize,
        rangeStart: offset,
        rangeEnd,
      }
    } catch (error) {
      mapRouteVoiceReportAzureStorageError(error)
    }
  }

  private async ensureContainerAccess(): Promise<void> {
    if (this.containerAccessVerified) {
      return
    }
    try {
      const props = await this.containerClient.getProperties()
      // Private containers omit blobPublicAccess; any public level is forbidden.
      if (props.blobPublicAccess) {
        throw new RouteVoiceReportStorageFailedException()
      }
      this.containerAccessVerified = true
    } catch (error) {
      mapRouteVoiceReportAzureStorageError(error)
    }
  }

  /**
   * Explicit private-access verification for diagnostics/acceptance.
   * Does not create the container.
   */
  async verifyPrivateContainer(): Promise<{
    containerName: string
    exists: true
    privateAccess: true
  }> {
    try {
      const props = await this.containerClient.getProperties()
      if (props.blobPublicAccess) {
        throw new RouteVoiceReportStorageFailedException()
      }
      this.containerAccessVerified = true
      return {
        containerName: this.containerName,
        exists: true,
        privateAccess: true,
      }
    } catch (error) {
      mapRouteVoiceReportAzureStorageError(error)
    }
  }

  /** Expose container client for acceptance probes only (same private container). */
  getAcceptanceContainerClient(): ContainerClient {
    return this.containerClient
  }
}

function sanitizeBlobMetadata(
  metadata: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!metadata) {
    return undefined
  }
  const entries = Object.entries(metadata)
  if (entries.length === 0) {
    return undefined
  }
  const sanitized: Record<string, string> = {}
  let count = 0
  for (const [rawKey, rawValue] of entries) {
    if (count >= MAX_METADATA_ENTRIES) {
      break
    }
    if (
      typeof rawKey !== 'string' ||
      typeof rawValue !== 'string' ||
      !METADATA_KEY_PATTERN.test(rawKey) ||
      rawKey.length > MAX_METADATA_KEY_LENGTH ||
      rawValue.length > MAX_METADATA_VALUE_LENGTH
    ) {
      continue
    }
    if (!/^[\x20-\x7E]*$/.test(rawValue)) {
      continue
    }
    sanitized[rawKey] = rawValue
    count += 1
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}
