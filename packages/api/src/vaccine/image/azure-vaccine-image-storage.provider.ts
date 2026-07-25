import {
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
  generateBlobSASQueryParameters,
  RestError,
  SASProtocol,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'
import { Injectable } from '@nestjs/common'

import { parseAzureStorageSharedKeyCredential } from './azure-storage-connection'
import { mapAzureStorageError } from './azure-vaccine-image-storage.errors'
import { assertValidVaccineImageStorageKey } from './vaccine-image-storage-key'
import {
  VaccineImageCreateReadUrlInput,
  VaccineImageStorageProvider,
  VaccineImageStoreInput,
  VaccineImageStoreResult,
} from './vaccine-image-storage.provider'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'
import {
  VaccineImageBlobAlreadyExistsException,
  VaccineImageBlobNotFoundException,
  VaccineImageStorageConfigurationException,
} from './vaccine-image-storage.exceptions'

/** Clock-skew allowance so clients slightly behind wall clock still accept SAS. */
const SAS_CLOCK_SKEW_MS = 5 * 60 * 1000

/** Bound non-sensitive blob metadata key/value sizes. */
const MAX_METADATA_ENTRIES = 8
const MAX_METADATA_KEY_LENGTH = 64
const MAX_METADATA_VALUE_LENGTH = 256
const METADATA_KEY_PATTERN = /^[a-zA-Z0-9_]+$/

export type AzureVaccineImageStorageConfig = {
  connectionString: string
  containerName: string
  readUrlTtlSeconds: number
}

/**
 * Production Azure Blob Storage provider for vaccine images.
 * Container is assumed to exist and remain private (no anonymous access).
 * BlobServiceClient / ContainerClient are constructed once per provider instance.
 */
@Injectable()
export class AzureVaccineImageStorageProvider
  implements VaccineImageStorageProvider
{
  private readonly containerClient: ContainerClient
  private readonly credential: StorageSharedKeyCredential
  private readonly containerName: string
  private readonly readUrlTtlSeconds: number
  private containerAccessVerified = false

  private constructor(
    containerClient: ContainerClient,
    credential: StorageSharedKeyCredential,
    containerName: string,
    readUrlTtlSeconds: number,
  ) {
    this.containerClient = containerClient
    this.credential = credential
    this.containerName = containerName
    this.readUrlTtlSeconds = readUrlTtlSeconds
  }

  /**
   * Build a provider from validated env config.
   * Fails clearly when the connection string cannot produce SharedKey SAS.
   */
  static fromConfig(
    config: AzureVaccineImageStorageConfig,
  ): AzureVaccineImageStorageProvider {
    if (
      typeof config.containerName !== 'string' ||
      config.containerName.trim().length === 0
    ) {
      throw new VaccineImageStorageConfigurationException(
        'AZURE_STORAGE_CONTAINER_NAME is required when vaccine image storage provider is azure',
      )
    }

    if (
      typeof config.readUrlTtlSeconds !== 'number' ||
      !Number.isInteger(config.readUrlTtlSeconds) ||
      config.readUrlTtlSeconds < 60 ||
      config.readUrlTtlSeconds > 3600
    ) {
      throw new VaccineImageStorageConfigurationException(
        'AZURE_STORAGE_READ_URL_TTL_SECONDS must be an integer between 60 and 3600',
      )
    }

    const credential = parseAzureStorageSharedKeyCredential(
      config.connectionString,
    )
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      config.connectionString,
    )
    const containerClient = blobServiceClient.getContainerClient(
      config.containerName.trim(),
    )

    return new AzureVaccineImageStorageProvider(
      containerClient,
      credential,
      config.containerName.trim(),
      config.readUrlTtlSeconds,
    )
  }

  async store(input: VaccineImageStoreInput): Promise<VaccineImageStoreResult> {
    const storageKey = assertValidVaccineImageStorageKey(input.storageKey)

    if (!Buffer.isBuffer(input.bytes) || input.bytes.length === 0) {
      throw new VaccineImageStorageConfigurationException(
        'Vaccine image store requires non-empty validated bytes',
      )
    }

    if (
      typeof input.mimeType !== 'string' ||
      input.mimeType.trim().length === 0
    ) {
      throw new VaccineImageStorageConfigurationException(
        'Vaccine image store requires a MIME type',
      )
    }

    await this.ensureContainerAccess()

    const blockBlob = this.containerClient.getBlockBlobClient(storageKey)
    const metadata = sanitizeBlobMetadata(input.metadata)

    try {
      await blockBlob.uploadData(input.bytes, {
        blobHTTPHeaders: {
          blobContentType: input.mimeType.trim(),
        },
        metadata,
        conditions: {
          // Prevent accidental overwrite of an existing blob.
          ifNoneMatch: '*',
        },
      })
    } catch (error) {
      if (isBlobAlreadyExistsError(error)) {
        throw new VaccineImageBlobAlreadyExistsException()
      }
      mapAzureStorageError(error)
    }

    return {
      provider: VaccineImageStorageProviderId.AZURE_BLOB,
      storageKey,
    }
  }

  async delete(storageKey: string): Promise<void> {
    const key = assertValidVaccineImageStorageKey(storageKey)
    await this.ensureContainerAccess()

    const blockBlob = this.containerClient.getBlockBlobClient(key)

    try {
      // Idempotent: missing blob is success; auth/network failures still throw.
      await blockBlob.deleteIfExists()
    } catch (error) {
      mapAzureStorageError(error)
    }
  }

  async createReadUrl(input: VaccineImageCreateReadUrlInput): Promise<string> {
    const storageKey = assertValidVaccineImageStorageKey(input.storageKey)
    await this.ensureContainerAccess()

    const blockBlob = this.containerClient.getBlockBlobClient(storageKey)

    let exists: boolean
    try {
      exists = await blockBlob.exists()
    } catch (error) {
      mapAzureStorageError(error)
    }

    if (!exists) {
      throw new VaccineImageBlobNotFoundException()
    }

    const ttlSeconds = resolveReadTtlSeconds(
      input.expiresInSeconds,
      this.readUrlTtlSeconds,
    )
    const startsOn = new Date(Date.now() - SAS_CLOCK_SKEW_MS)
    const expiresOn = new Date(Date.now() + ttlSeconds * 1000)

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: storageKey,
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn,
        protocol: SASProtocol.Https,
      },
      this.credential,
    ).toString()

    // Blob URL is HTTPS from the account endpoint; SAS is query-only read.
    return `${blockBlob.url}?${sasToken}`
  }

  /**
   * Lazy container access check — do not create the container at startup.
   */
  private async ensureContainerAccess(): Promise<void> {
    if (this.containerAccessVerified) {
      return
    }

    try {
      await this.containerClient.getProperties()
      this.containerAccessVerified = true
    } catch (error) {
      mapAzureStorageError(error)
    }
  }
}

function resolveReadTtlSeconds(
  requested: number | undefined,
  configuredDefault: number,
): number {
  if (requested === undefined) {
    return configuredDefault
  }
  if (
    !Number.isInteger(requested) ||
    requested < 60 ||
    requested > 3600
  ) {
    throw new VaccineImageStorageConfigurationException(
      'Read URL TTL must be an integer between 60 and 3600 seconds',
    )
  }
  return requested
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
    // Azure metadata values must be ASCII; skip anything else.
    if (!/^[\x20-\x7E]*$/.test(rawValue)) {
      continue
    }
    sanitized[rawKey] = rawValue
    count += 1
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function isBlobAlreadyExistsError(error: unknown): boolean {
  if (error instanceof RestError) {
    return (
      error.statusCode === 409 ||
      error.code === 'BlobAlreadyExists' ||
      error.code === 'ConditionNotMet'
    )
  }
  if (!error || typeof error !== 'object') {
    return false
  }
  const statusCode =
    'statusCode' in error ? error.statusCode : undefined
  const code = 'code' in error ? error.code : undefined
  return (
    statusCode === 409 ||
    code === 'BlobAlreadyExists' ||
    code === 'ConditionNotMet'
  )
}
