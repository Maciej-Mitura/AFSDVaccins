import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'

export const VACCINE_IMAGE_STORAGE_PROVIDER = Symbol(
  'VACCINE_IMAGE_STORAGE_PROVIDER',
)

export type VaccineImageStoreInput = {
  bytes: Buffer
  storageKey: string
  mimeType: string
  metadata?: Record<string, string>
}

export type VaccineImageStoreResult = {
  provider: VaccineImageStorageProviderId
  storageKey: string
}

export type VaccineImageCreateReadUrlInput = {
  storageKey: string
  /** Suggested TTL for the short-lived URL (seconds). */
  expiresInSeconds?: number
}

export interface VaccineImageStorageProvider {
  store(input: VaccineImageStoreInput): Promise<VaccineImageStoreResult>
  delete(storageKey: string): Promise<void>
  /**
   * Returns a short-lived read URL — never a permanent public URL.
   */
  createReadUrl(input: VaccineImageCreateReadUrlInput): Promise<string>
}
