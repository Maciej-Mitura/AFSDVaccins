import { LazyMetadataStorage } from '@nestjs/graphql/dist/schema-builder/storages/lazy-metadata.storage'
import { TypeMetadataStorage } from '@nestjs/graphql'

import { VaccineImage } from './vaccine-image.embed'
import './vaccine-image-validation-status.enum'
import './vaccine-image-ai-provider.enum'
import './vaccine-image-storage-provider.enum'
import './vaccine-image-override-decision.enum'
import { VaccineImageFieldsResolver } from './vaccine-image-fields.resolver'

describe('VaccineImage GraphQL surface', () => {
  let fieldNames: Set<string>

  beforeAll(() => {
    LazyMetadataStorage.load()
    TypeMetadataStorage.compile([VaccineImage])

    const objectMeta =
      TypeMetadataStorage.getObjectTypeMetadataByTarget(VaccineImage)

    fieldNames = new Set(
      (objectMeta?.properties ?? []).map(property => property.name),
    )
  })

  it('exposes only safe catalogue fields on the ObjectType', () => {
    for (const name of [
      'originalFilename',
      'mimeType',
      'width',
      'height',
      'validationStatus',
      'aiCaption',
      'aiConfidence',
      'aiTags',
      'aiReason',
      'uploadedAt',
    ]) {
      expect(fieldNames.has(name)).toBe(true)
    }
  })

  it('resolves imageUrl via ResolveField (not a persisted column)', () => {
    expect(typeof VaccineImageFieldsResolver.prototype.imageUrl).toBe(
      'function',
    )
    expect(fieldNames.has('imageUrl')).toBe(false)
  })

  it('does not expose storage keys, providers, or internal AI evidence', () => {
    for (const name of [
      'storageKey',
      'storageProvider',
      'sizeBytes',
      'aiProvider',
      'aiDetectedText',
      'analysedAt',
      'uploadedByUserId',
      'adminOverride',
      'rawEvidenceSummary',
      'bytes',
      'connectionString',
      'sasToken',
      'accountKey',
    ]) {
      expect(fieldNames.has(name)).toBe(false)
    }
  })
})
