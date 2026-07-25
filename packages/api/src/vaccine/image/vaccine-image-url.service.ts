import { Inject, Injectable } from '@nestjs/common'

import { isVaccineImageBrowseable } from './vaccine-image.browseable'
import { VaccineImage } from './vaccine-image.embed'
import { VACCINE_IMAGE_STORAGE_PROVIDER } from './vaccine-image-storage.provider'
import type { VaccineImageStorageProvider } from './vaccine-image-storage.provider'

/**
 * Resolves short-lived catalogue image read URLs at GraphQL response time.
 *
 * Temporary SAS / fake URLs must never be written into Vaccine documents or the
 * long-lived catalogue cache (`vaccines:active` / `vaccines:all`). Cached vaccine
 * objects may include image metadata (storageKey, validationStatus, …) but
 * `imageUrl` is always generated here via ResolveField so an expired SAS cannot
 * remain trapped in cache.
 */
@Injectable()
export class VaccineImageUrlService {
  constructor(
    @Inject(VACCINE_IMAGE_STORAGE_PROVIDER)
    private readonly storage: VaccineImageStorageProvider,
  ) {}

  /**
   * Returns a short-lived read URL for browseable images; otherwise null.
   * Non-browseable statuses (PENDING_ANALYSIS, REJECTED, ANALYSIS_FAILED) → null.
   */
  async resolveReadUrl(
    image: VaccineImage | null | undefined,
  ): Promise<string | null> {
    if (!image || !isVaccineImageBrowseable(image.validationStatus)) {
      return null
    }

    // Provider errors are domain exceptions (no credentials / SAS leakage).
    return this.storage.createReadUrl({ storageKey: image.storageKey })
  }
}
