import { Injectable } from '@nestjs/common'

import { assertValidVaccineImageStorageKey } from './vaccine-image-storage-key'
import {
  VaccineImageCreateReadUrlInput,
  VaccineImageStorageProvider,
  VaccineImageStoreInput,
  VaccineImageStoreResult,
} from './vaccine-image-storage.provider'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'
import { VaccineImageBlobNotFoundException } from './vaccine-image-storage.exceptions'

const DEFAULT_READ_URL_TTL_SECONDS = 300

/**
 * In-memory blob store for tests and local architecture validation.
 * Does not call Azure. Temporary read URLs are synthetic and short-lived by design.
 * Deterministic for the same storageKey / bytes inputs.
 */
@Injectable()
export class FakeVaccineImageStorageProvider
  implements VaccineImageStorageProvider
{
  private readonly blobs = new Map<
    string,
    { bytes: Buffer; mimeType: string; metadata?: Record<string, string> }
  >()

  store(input: VaccineImageStoreInput): Promise<VaccineImageStoreResult> {
    const storageKey = assertValidVaccineImageStorageKey(input.storageKey)
    this.blobs.set(storageKey, {
      bytes: Buffer.from(input.bytes),
      mimeType: input.mimeType,
      metadata: input.metadata ? { ...input.metadata } : undefined,
    })

    return Promise.resolve({
      provider: VaccineImageStorageProviderId.FAKE,
      storageKey,
    })
  }

  delete(storageKey: string): Promise<void> {
    const key = assertValidVaccineImageStorageKey(storageKey)
    this.blobs.delete(key)
    return Promise.resolve()
  }

  createReadUrl(input: VaccineImageCreateReadUrlInput): Promise<string> {
    const storageKey = assertValidVaccineImageStorageKey(input.storageKey)
    if (!this.blobs.has(storageKey)) {
      return Promise.reject(new VaccineImageBlobNotFoundException())
    }

    const expiresInSeconds =
      input.expiresInSeconds ?? DEFAULT_READ_URL_TTL_SECONDS
    const expiresAt = Date.now() + expiresInSeconds * 1000

    return Promise.resolve(
      `https://fake-vaccine-image.local/read/${encodeURIComponent(storageKey)}?expires=${expiresAt}`,
    )
  }

  /** Test helper — not part of the storage contract. */
  has(storageKey: string): boolean {
    return this.blobs.has(storageKey)
  }

  /** Test helper — not part of the storage contract. */
  getBytes(storageKey: string): Buffer | undefined {
    return this.blobs.get(storageKey)?.bytes
  }

  /** Test helper — not part of the storage contract. */
  getMimeType(storageKey: string): string | undefined {
    return this.blobs.get(storageKey)?.mimeType
  }
}
