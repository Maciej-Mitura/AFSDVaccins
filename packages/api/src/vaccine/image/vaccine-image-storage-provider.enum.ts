import { registerEnumType } from '@nestjs/graphql'

/**
 * Persisted binary storage provider identifiers.
 * AZURE_BLOB is the production target (replaceable behind the storage interface).
 * FAKE is for explicit non-production test/local providers only.
 */
export enum VaccineImageStorageProviderId {
  AZURE_BLOB = 'AZURE_BLOB',
  FAKE = 'FAKE',
}

registerEnumType(VaccineImageStorageProviderId, {
  name: 'VaccineImageStorageProvider',
  description: 'Provider that stores vaccine image binary data',
})
