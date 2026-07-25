import { StorageSharedKeyCredential } from '@azure/storage-blob'

import { VaccineImageStorageConfigurationException } from './vaccine-image-storage.exceptions'

/**
 * Parse AccountName + AccountKey from an Azure Storage connection string.
 * Required for blob-specific SAS generation. Never log the raw string or key.
 */
export function parseAzureStorageSharedKeyCredential(
  connectionString: string,
): StorageSharedKeyCredential {
  if (typeof connectionString !== 'string' || connectionString.trim().length === 0) {
    throw new VaccineImageStorageConfigurationException(
      'AZURE_STORAGE_CONNECTION_STRING is required when vaccine image storage provider is azure',
    )
  }

  const parts = connectionString.split(';').filter(part => part.length > 0)
  const map = new Map<string, string>()
  for (const part of parts) {
    const separator = part.indexOf('=')
    if (separator <= 0) {
      continue
    }
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key.length > 0) {
      map.set(key.toLowerCase(), value)
    }
  }

  const accountName = map.get('accountname')
  const accountKey = map.get('accountkey')

  if (!accountName || accountName.length === 0) {
    throw new VaccineImageStorageConfigurationException(
      'AZURE_STORAGE_CONNECTION_STRING must include AccountName for SAS generation',
    )
  }

  if (!accountKey || accountKey.length === 0) {
    throw new VaccineImageStorageConfigurationException(
      'AZURE_STORAGE_CONNECTION_STRING must include AccountKey for SAS generation; public or SAS-only connection strings are not supported',
    )
  }

  return new StorageSharedKeyCredential(accountName, accountKey)
}
