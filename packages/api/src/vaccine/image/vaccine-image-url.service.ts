import { Injectable } from '@nestjs/common'

import { isVaccineImageBrowseable } from './vaccine-image.browseable'
import { VaccineImage } from './vaccine-image.embed'

/**
 * Placeholder application service for short-lived catalogue image URLs.
 * Phase 25C will call VaccineImageStorageProvider.createReadUrl here.
 */
@Injectable()
export class VaccineImageUrlService {
  /**
   * Returns a short-lived read URL when available.
   * Phase 25B always returns null so catalogue reads do not depend on Azure.
   */
  resolveReadUrl(image: VaccineImage | null | undefined): Promise<string | null> {
    if (!image || !isVaccineImageBrowseable(image.validationStatus)) {
      return Promise.resolve(null)
    }

    // Phase 25C: return this.storage.createReadUrl({ storageKey: image.storageKey })
    return Promise.resolve(null)
  }
}
