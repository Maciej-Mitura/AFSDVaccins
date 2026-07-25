import { Injectable } from '@nestjs/common'

import {
  VaccineImageCreateReadUrlInput,
  VaccineImageStorageProvider,
  VaccineImageStoreInput,
  VaccineImageStoreResult,
} from './vaccine-image-storage.provider'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'

const DEFAULT_READ_URL_TTL_SECONDS = 300

/**
 * In-memory blob store for tests and local architecture validation.
 * Does not call Azure. Temporary read URLs are synthetic and short-lived by design.
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
    this.blobs.set(input.storageKey, {
      bytes: Buffer.from(input.bytes),
      mimeType: input.mimeType,
      metadata: input.metadata ? { ...input.metadata } : undefined,
    })

    return Promise.resolve({
      provider: VaccineImageStorageProviderId.FAKE,
      storageKey: input.storageKey,
    })
  }

  delete(storageKey: string): Promise<void> {
    this.blobs.delete(storageKey)
    return Promise.resolve()
  }

  createReadUrl(input: VaccineImageCreateReadUrlInput): Promise<string> {
    if (!this.blobs.has(input.storageKey)) {
      return Promise.reject(
        new Error(`Fake storage: unknown storageKey ${input.storageKey}`),
      )
    }

    const expiresInSeconds =
      input.expiresInSeconds ?? DEFAULT_READ_URL_TTL_SECONDS
    const expiresAt = Date.now() + expiresInSeconds * 1000

    return Promise.resolve(
      `https://fake-vaccine-image.local/read/${encodeURIComponent(input.storageKey)}?expires=${expiresAt}`,
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
}
