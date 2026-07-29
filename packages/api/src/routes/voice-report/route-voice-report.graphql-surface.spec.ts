import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const typeSource = readFileSync(
  join(__dirname, 'route-voice-report.type.ts'),
  'utf8',
)
const entitySource = readFileSync(
  join(__dirname, 'route-voice-report.entity.ts'),
  'utf8',
)

/** Extract `@Field(...) name!:` property names from a GraphQL ObjectType class body. */
function extractDecoratedFieldNames(source: string, className: string): Set<string> {
  const classMatch = new RegExp(
    `export class ${className}[^{]*\\{([\\s\\S]*?)\\n\\}`,
  ).exec(source)
  if (!classMatch) {
    throw new Error(`Could not locate class ${className}`)
  }
  const body = classMatch[1]
  const names = new Set<string>()
  const fieldRegex = /@Field\([\s\S]*?\)\s*\n\s*([A-Za-z0-9_]+)!/g
  let match: RegExpExecArray | null
  while ((match = fieldRegex.exec(body)) !== null) {
    names.add(match[1])
  }
  return names
}

describe('RouteVoiceReport GraphQL surface', () => {
  const gqlFieldNames = extractDecoratedFieldNames(typeSource, 'RouteVoiceReportGql')
  const updateFieldNames = extractDecoratedFieldNames(
    typeSource,
    'RouteVoiceReportUpdateGql',
  )

  it('exposes safe catalogue fields on RouteVoiceReport ObjectType', () => {
    for (const name of [
      'id',
      'routeId',
      'stopId',
      'stopSequence',
      'pharmacyDisplayName',
      'isLegacyRouteReport',
      'sequenceNumber',
      'status',
      'mimeType',
      'durationSeconds',
      'selectedLocale',
      'clientRecordedAt',
      'uploadedAt',
      'recordedByDisplayName',
      'canPlayAudio',
      'transcriptionStatus',
      'requestedLocale',
      'detectedLocale',
      'transcript',
      'confidence',
      'transcriptionStartedAt',
      'transcriptionCompletedAt',
      'transcriptionFailureCode',
      'effectiveDurationSeconds',
      'canRetryTranscription',
    ]) {
      expect(gqlFieldNames.has(name)).toBe(true)
    }
  })

  it('does not expose blobName, containerName, sha256, or recordedByUserId', () => {
    for (const name of [
      'blobName',
      'containerName',
      'sha256',
      'recordedByUserId',
      'idempotencyFingerprint',
      'clientUploadId',
      'codec',
      'fileExtension',
      'sizeBytes',
      'bezorgerProfileId',
      'apothekerProfileId',
      'storageUrl',
      'azureUrl',
      'sasToken',
      'connectionString',
      'processingLeaseId',
      'providerRequestId',
      'failureMessageSafe',
      'attemptCount',
    ]) {
      expect(gqlFieldNames.has(name)).toBe(false)
    }
  })

  it('keeps subscription update payload free of storage fields', () => {
    for (const name of [
      'routeId',
      'reportId',
      'stopId',
      'status',
      'transcriptionStatus',
      'eventType',
    ]) {
      expect(updateFieldNames.has(name)).toBe(true)
    }
    for (const name of [
      'blobName',
      'containerName',
      'sha256',
      'recordedByUserId',
      'transcript',
      'providerRequestId',
      'apothekerProfileId',
    ]) {
      expect(updateFieldNames.has(name)).toBe(false)
    }
  })

  it('entity persists storage fields that GraphQL must never surface', () => {
    for (const column of [
      'blobName',
      'containerName',
      'sha256',
      'recordedByUserId',
      'apothekerProfileId',
    ]) {
      expect(entitySource).toContain(column)
      expect(gqlFieldNames.has(column)).toBe(false)
    }
  })
})
