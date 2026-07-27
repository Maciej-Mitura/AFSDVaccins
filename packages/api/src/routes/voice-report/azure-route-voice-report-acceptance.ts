import {
  BlobServiceClient,
  ContainerClient,
  RestError,
} from '@azure/storage-blob'
import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'

import { parseAzureStorageSharedKeyCredential } from '../../vaccine/image/azure-storage-connection'
import { AzureRouteVoiceReportStorageProvider } from './azure-route-voice-report-storage.provider'
import { mapRouteVoiceReportAzureStorageError } from './route-voice-report-storage.errors'
import { RouteVoiceReportStorageFailedException } from './route-voice-report.exceptions'
import { ROUTE_VOICE_ACCEPTANCE_PROBE_BLOB_PREFIX } from './route-voice-transcription.constants'

const PROBE_CONTENT_TYPE = 'application/octet-stream'
const PROBE_PAYLOAD = Buffer.from('route-voice-report-azure-acceptance-probe-v1')

export type VoiceReportStorageAcceptanceResult = {
  ok: true
  containerName: string
  privateAccess: true
  blobName: string
  sha256: string
  rangeVerified: true
  cleanedUp: boolean
}

export function assertValidAcceptanceProbeBlobName(blobName: string): string {
  if (typeof blobName !== 'string') {
    throw new RouteVoiceReportStorageFailedException()
  }
  const trimmed = blobName.trim()
  if (
    trimmed !== blobName ||
    trimmed.includes('..') ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    throw new RouteVoiceReportStorageFailedException()
  }
  if (
    !/^_acceptance-tests\/voice-reports\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/probe\.bin$/i.test(
      trimmed,
    )
  ) {
    throw new RouteVoiceReportStorageFailedException()
  }
  return trimmed
}

export function buildAcceptanceProbeBlobName(probeId = randomUUID()): string {
  return `${ROUTE_VOICE_ACCEPTANCE_PROBE_BLOB_PREFIX}${probeId}/probe.bin`
}

/**
 * Optional explicit container create for acceptance only.
 * Always private (no anonymous access). Idempotent when already exists.
 */
export async function createPrivateVoiceReportContainerIfNeeded(input: {
  connectionString: string
  containerName: string
}): Promise<{ created: boolean; containerName: string }> {
  parseAzureStorageSharedKeyCredential(input.connectionString)
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    input.connectionString,
  )
  const containerClient = blobServiceClient.getContainerClient(
    input.containerName.trim(),
  )
  try {
    const response = await containerClient.createIfNotExists()
    // Never enable public access after create.
    const props = await containerClient.getProperties()
    if (props.blobPublicAccess) {
      throw new RouteVoiceReportStorageFailedException()
    }
    return {
      created: response.succeeded === true,
      containerName: input.containerName.trim(),
    }
  } catch (error) {
    mapRouteVoiceReportAzureStorageError(error)
  }
}

/**
 * Blob acceptance probe against the production Azure storage adapter + private
 * container. Never uses production route/report blob paths. Never touches Mongo.
 */
export async function runVoiceReportAzureStorageAcceptance(input: {
  connectionString: string
  containerName: string
  createContainer?: boolean
}): Promise<VoiceReportStorageAcceptanceResult> {
  if (input.createContainer) {
    await createPrivateVoiceReportContainerIfNeeded({
      connectionString: input.connectionString,
      containerName: input.containerName,
    })
  }

  const provider = AzureRouteVoiceReportStorageProvider.fromConfig({
    connectionString: input.connectionString,
    containerName: input.containerName,
  })

  await provider.verifyPrivateContainer()

  const blobName = assertValidAcceptanceProbeBlobName(
    buildAcceptanceProbeBlobName(),
  )
  const containerClient = provider.getAcceptanceContainerClient()
  const expectedSha = createHash('sha256').update(PROBE_PAYLOAD).digest('hex')
  let cleanedUp = false

  try {
    await uploadAcceptanceProbe(containerClient, blobName, PROBE_PAYLOAD)
    const props = await containerClient.getBlockBlobClient(blobName).getProperties()
    if ((props.contentType ?? '') !== PROBE_CONTENT_TYPE) {
      throw new RouteVoiceReportStorageFailedException()
    }
    if ((props.contentLength ?? 0) !== PROBE_PAYLOAD.length) {
      throw new RouteVoiceReportStorageFailedException()
    }

    const full = await downloadAcceptanceBytes(
      containerClient,
      blobName,
      0,
      PROBE_PAYLOAD.length,
    )
    const fullSha = createHash('sha256').update(full).digest('hex')
    if (fullSha !== expectedSha || !full.equals(PROBE_PAYLOAD)) {
      throw new RouteVoiceReportStorageFailedException()
    }

    const rangeOffset = Math.min(8, PROBE_PAYLOAD.length - 1)
    const rangeCount = Math.min(12, PROBE_PAYLOAD.length - rangeOffset)
    const ranged = await downloadAcceptanceBytes(
      containerClient,
      blobName,
      rangeOffset,
      rangeCount,
    )
    const expectedRange = PROBE_PAYLOAD.subarray(
      rangeOffset,
      rangeOffset + rangeCount,
    )
    if (!ranged.equals(expectedRange)) {
      throw new RouteVoiceReportStorageFailedException()
    }

    await containerClient.getBlockBlobClient(blobName).deleteIfExists()
    const stillExists = await containerClient.getBlockBlobClient(blobName).exists()
    if (stillExists) {
      throw new RouteVoiceReportStorageFailedException()
    }
    cleanedUp = true

    return {
      ok: true,
      containerName: provider.containerName,
      privateAccess: true,
      blobName,
      sha256: expectedSha,
      rangeVerified: true,
      cleanedUp,
    }
  } catch (error) {
    try {
      await containerClient.getBlockBlobClient(blobName).deleteIfExists()
      cleanedUp = !(await containerClient.getBlockBlobClient(blobName).exists())
    } catch {
      cleanedUp = false
    }
    if (!cleanedUp) {
      const wrapped = new Error(
        `Azure Blob acceptance failed; cleanup warning for probe ${blobName}`,
      )
      ;(wrapped as Error & { cause?: unknown }).cause = error
      throw wrapped
    }
    throw error
  }
}

async function uploadAcceptanceProbe(
  containerClient: ContainerClient,
  blobName: string,
  bytes: Buffer,
): Promise<void> {
  const blockBlob = containerClient.getBlockBlobClient(blobName)
  try {
    await blockBlob.uploadData(bytes, {
      blobHTTPHeaders: {
        blobContentType: PROBE_CONTENT_TYPE,
      },
      conditions: {
        ifNoneMatch: '*',
      },
    })
  } catch (error) {
    if (error instanceof RestError && error.statusCode === 409) {
      throw new RouteVoiceReportStorageFailedException()
    }
    mapRouteVoiceReportAzureStorageError(error)
  }
}

async function downloadAcceptanceBytes(
  containerClient: ContainerClient,
  blobName: string,
  offset: number,
  count: number,
): Promise<Buffer> {
  const blockBlob = containerClient.getBlockBlobClient(blobName)
  try {
    const download = await blockBlob.download(offset, count)
    const body = download.readableStreamBody
    if (!body) {
      throw new RouteVoiceReportStorageFailedException()
    }
    const stream =
      typeof (body as { pipe?: unknown }).pipe === 'function'
        ? (body as Readable)
        : Readable.from(body as AsyncIterable<Buffer>)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk)
      } else if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk, 'utf8'))
      } else {
        chunks.push(Buffer.from(new Uint8Array(chunk as ArrayBufferLike)))
      }
    }
    return Buffer.concat(chunks)
  } catch (error) {
    mapRouteVoiceReportAzureStorageError(error)
  }
}
