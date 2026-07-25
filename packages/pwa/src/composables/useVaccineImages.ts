import {
  deleteVaccineImage,
  overrideVaccineImage,
  uploadVaccineImage,
  type VaccineImageOverrideDecision,
  type VaccineImageSafePayload,
} from '@/api/vaccine-image-rest'
import { mapVaccineImageRestError } from '@/api/vaccine-image-errors'
import { useVaccines } from '@/composables/useVaccines'

export function useVaccineImages() {
  const { patchVaccineImage, loadVaccines } = useVaccines()

  async function upload(
    vaccineId: string,
    file: File,
  ): Promise<VaccineImageSafePayload> {
    const result = await uploadVaccineImage(vaccineId, file)
    patchVaccineImage(vaccineId, result.image)
    return result.image
  }

  async function remove(vaccineId: string): Promise<void> {
    await deleteVaccineImage(vaccineId)
    patchVaccineImage(vaccineId, null)
  }

  async function override(
    vaccineId: string,
    decision: VaccineImageOverrideDecision,
    reason: string,
  ): Promise<VaccineImageSafePayload> {
    const result = await overrideVaccineImage(vaccineId, decision, reason)
    patchVaccineImage(vaccineId, result.image)
    return result.image
  }

  /** Soft refresh to obtain a fresh signed imageUrl (SAS expiry). */
  async function refreshCatalogue(includeInactive = true): Promise<void> {
    await loadVaccines(includeInactive)
  }

  return {
    upload,
    remove,
    override,
    refreshCatalogue,
    mapVaccineImageRestError,
  }
}
