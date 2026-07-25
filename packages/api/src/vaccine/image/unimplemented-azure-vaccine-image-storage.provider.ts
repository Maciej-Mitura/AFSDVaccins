import { Injectable } from '@nestjs/common'

import {
  VaccineImageCreateReadUrlInput,
  VaccineImageStorageProvider,
  VaccineImageStoreInput,
  VaccineImageStoreResult,
} from './vaccine-image-storage.provider'

/**
 * Production-selected Azure Blob placeholder (Phase 25C+).
 * Selected when VACCINE_IMAGE_STORAGE_PROVIDER=azure; does not call Azure yet.
 */
@Injectable()
export class UnimplementedAzureVaccineImageStorageProvider
  implements VaccineImageStorageProvider
{
  store(input: VaccineImageStoreInput): Promise<VaccineImageStoreResult> {
    void input
    return Promise.reject(
      new Error(
        'Azure Blob Storage provider is not implemented yet (Phase 25C+)',
      ),
    )
  }

  delete(storageKey: string): Promise<void> {
    void storageKey
    return Promise.reject(
      new Error(
        'Azure Blob Storage provider is not implemented yet (Phase 25C+)',
      ),
    )
  }

  createReadUrl(input: VaccineImageCreateReadUrlInput): Promise<string> {
    void input
    return Promise.reject(
      new Error(
        'Azure Blob Storage provider is not implemented yet (Phase 25C+)',
      ),
    )
  }
}
