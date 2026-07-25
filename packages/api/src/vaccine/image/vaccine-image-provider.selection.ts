export type VaccineImageProviderMode = 'fake' | 'azure'

/**
 * Resolves analysis/storage provider mode from config.
 * Fake providers are never allowed when NODE_ENV=production.
 */
export function resolveVaccineImageProviderMode(
  configured: string | undefined,
  nodeEnv: string,
): VaccineImageProviderMode {
  const fallback: VaccineImageProviderMode =
    nodeEnv === 'production' ? 'azure' : 'fake'
  const mode = configured?.trim() || fallback

  if (mode !== 'fake' && mode !== 'azure') {
    throw new Error(
      `Invalid vaccine image provider mode "${mode}" (expected fake|azure)`,
    )
  }

  if (mode === 'fake' && nodeEnv === 'production') {
    throw new Error(
      'Fake vaccine image providers cannot be activated in production',
    )
  }

  return mode
}

export function assertVaccineImageProvidersAllowedForEnv(
  analysisMode: VaccineImageProviderMode,
  storageMode: VaccineImageProviderMode,
  nodeEnv: string,
): void {
  if (nodeEnv === 'production') {
    if (analysisMode === 'fake' || storageMode === 'fake') {
      throw new Error(
        'Fake vaccine image providers cannot be activated in production',
      )
    }
  }
}
