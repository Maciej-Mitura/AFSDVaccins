import { createHash, randomUUID } from 'node:crypto'

import {
  ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES,
  ROUTE_VOICE_REPORT_MAX_BROWSER_FORMAT_LABEL_LENGTH,
  ROUTE_VOICE_REPORT_MAX_CLIENT_RECORDED_AT_LENGTH,
  ROUTE_VOICE_REPORT_MAX_CLIENT_UPLOAD_ID_LENGTH,
  ROUTE_VOICE_REPORT_MAX_DURATION_SECONDS,
  ROUTE_VOICE_REPORT_MAX_SELECTED_LOCALE_LENGTH,
  ROUTE_VOICE_REPORT_MIN_CLIENT_UPLOAD_ID_LENGTH,
  ROUTE_VOICE_REPORT_MIN_DURATION_SECONDS,
  ROUTE_VOICE_REPORT_FUTURE_SKEW_MS,
} from './route-voice-report.constants'
import {
  RouteVoiceReportAudioEmptyException,
  RouteVoiceReportAudioRequiredException,
  RouteVoiceReportAudioSignatureInvalidException,
  RouteVoiceReportAudioTooLargeException,
  RouteVoiceReportAudioTypeUnsupportedException,
  RouteVoiceReportClientUploadIdInvalidException,
  RouteVoiceReportDurationInvalidException,
  RouteVoiceReportLocaleInvalidException,
  RouteVoiceReportStopIdRequiredException,
  RouteVoiceReportStopInvalidException,
  RouteVoiceReportTimestampInvalidException,
} from './route-voice-report.exceptions'

/** EBML / WebM container. */
const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3])
/** Ogg container. */
const OGG_MAGIC = Buffer.from('OggS', 'ascii')

export type RouteVoiceReportAudioFormat = 'webm' | 'ogg' | 'mp4'

export type RouteVoiceReportValidatedAudio = {
  bytes: Buffer
  mimeType: 'audio/webm' | 'audio/ogg' | 'audio/mp4'
  format: RouteVoiceReportAudioFormat
  extension: 'webm' | 'ogg' | 'm4a'
  codec: string | null
  sizeBytes: number
  sha256: string
}

const ALLOWED_DECLARED_MIME = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/x-m4a',
  'audio/aac',
])

/**
 * Validate uploaded audio without trusting filename or Content-Type alone.
 *
 * Duration strategy (Phase 34A):
 * - Client-declared duration is accepted only as bounded untrusted metadata
 *   (1–180 s). Reliable server-side duration extraction (FFmpeg / heavy parsers)
 *   is postponed; do not present durationSeconds as cryptographically authoritative.
 */
export function validateRouteVoiceReportAudio(input: {
  bytes: Buffer | undefined | null
  declaredMimeType?: string | null
}): RouteVoiceReportValidatedAudio {
  if (!input.bytes || !Buffer.isBuffer(input.bytes)) {
    throw new RouteVoiceReportAudioRequiredException()
  }

  if (input.bytes.length === 0) {
    throw new RouteVoiceReportAudioEmptyException()
  }

  if (input.bytes.length > ROUTE_VOICE_REPORT_MAX_AUDIO_BYTES) {
    throw new RouteVoiceReportAudioTooLargeException()
  }

  const magic = detectAudioMagic(input.bytes)
  if (!magic) {
    throw new RouteVoiceReportAudioSignatureInvalidException()
  }

  const declared = normalizeDeclaredMime(input.declaredMimeType)
  if (declared && !isDeclaredMimeCompatible(declared, magic.format)) {
    throw new RouteVoiceReportAudioTypeUnsupportedException()
  }

  const codec = extractCodecHint(declared)

  return {
    bytes: input.bytes,
    mimeType: magic.mimeType,
    format: magic.format,
    extension: magic.extension,
    codec,
    sizeBytes: input.bytes.length,
    sha256: createHash('sha256').update(input.bytes).digest('hex'),
  }
}

export function parseDurationSeconds(raw: unknown): number {
  if (typeof raw === 'number') {
    return assertDurationBounds(raw)
  }
  if (typeof raw !== 'string') {
    throw new RouteVoiceReportDurationInvalidException()
  }
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > 32) {
    throw new RouteVoiceReportDurationInvalidException()
  }
  const parsed = Number(trimmed)
  return assertDurationBounds(parsed)
}

function assertDurationBounds(value: number): number {
  if (
    !Number.isFinite(value) ||
    value < ROUTE_VOICE_REPORT_MIN_DURATION_SECONDS ||
    value > ROUTE_VOICE_REPORT_MAX_DURATION_SECONDS
  ) {
    throw new RouteVoiceReportDurationInvalidException()
  }
  // Store as a finite number with millisecond-ish precision at most.
  return Math.round(value * 1000) / 1000
}

export function parseClientRecordedAt(
  raw: unknown,
  options?: { now?: Date },
): Date {
  if (typeof raw !== 'string') {
    throw new RouteVoiceReportTimestampInvalidException()
  }
  const trimmed = raw.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > ROUTE_VOICE_REPORT_MAX_CLIENT_RECORDED_AT_LENGTH
  ) {
    throw new RouteVoiceReportTimestampInvalidException()
  }
  if (!trimmed.includes('T')) {
    throw new RouteVoiceReportTimestampInvalidException()
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    throw new RouteVoiceReportTimestampInvalidException()
  }
  const now = options?.now ?? new Date()
  if (
    parsed.getTime() >
    now.getTime() + ROUTE_VOICE_REPORT_FUTURE_SKEW_MS
  ) {
    throw new RouteVoiceReportTimestampInvalidException()
  }
  // Reject timestamps more than ~30 days in the past (operational bound).
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000
  if (parsed.getTime() < now.getTime() - maxAgeMs) {
    throw new RouteVoiceReportTimestampInvalidException()
  }
  return parsed
}

export function parseSelectedLocale(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') {
    return null
  }
  if (typeof raw !== 'string') {
    throw new RouteVoiceReportLocaleInvalidException()
  }
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (trimmed.length > ROUTE_VOICE_REPORT_MAX_SELECTED_LOCALE_LENGTH) {
    throw new RouteVoiceReportLocaleInvalidException()
  }
  // Phase 34B: en-GB | nl-NL | pl-PL | AUTO (null → AUTO at transcription init).
  if (
    trimmed !== 'en-GB' &&
    trimmed !== 'nl-NL' &&
    trimmed !== 'pl-PL' &&
    trimmed !== 'AUTO'
  ) {
    throw new RouteVoiceReportLocaleInvalidException()
  }
  return trimmed
}

export function parseClientUploadId(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new RouteVoiceReportClientUploadIdInvalidException()
  }
  const trimmed = raw.trim()
  if (
    trimmed.length < ROUTE_VOICE_REPORT_MIN_CLIENT_UPLOAD_ID_LENGTH ||
    trimmed.length > ROUTE_VOICE_REPORT_MAX_CLIENT_UPLOAD_ID_LENGTH
  ) {
    throw new RouteVoiceReportClientUploadIdInvalidException()
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    throw new RouteVoiceReportClientUploadIdInvalidException()
  }
  return trimmed
}

export function parseBrowserFormatLabel(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') {
    return null
  }
  if (typeof raw !== 'string') {
    return null
  }
  const trimmed = raw.trim().slice(0, ROUTE_VOICE_REPORT_MAX_BROWSER_FORMAT_LABEL_LENGTH)
  return trimmed.length > 0 ? trimmed : null
}

export function buildIdempotencyFingerprint(input: {
  mimeType: string
  sizeBytes: number
  durationSeconds: number
  sha256: string
  selectedLocale: string | null
}): string {
  const payload = [
    input.mimeType,
    String(input.sizeBytes),
    String(input.durationSeconds),
    input.sha256,
    input.selectedLocale ?? '',
  ].join('|')
  return createHash('sha256').update(payload).digest('hex')
}

/**
 * Opaque blob path (Phase 36E stop-scoped):
 * route-voice-reports/{routeId}/stops/{stopId}/{reportId}/audio.{ext}
 *
 * Legacy (pre-36E) paths remain readable via {@link assertValidRouteVoiceReportBlobName}:
 * route-voice-reports/{routeId}/{reportId}/audio.{ext}
 *
 * Never includes courier/pharmacy display names.
 */
export function generateRouteVoiceReportBlobName(input: {
  routeId: string
  stopId: string
  reportId: string
  extension: RouteVoiceReportValidatedAudio['extension']
}): string {
  const routeId = assertObjectIdSegment(input.routeId)
  const stopId = assertSafeStopIdSegment(input.stopId)
  const reportId = assertObjectIdSegment(input.reportId)
  return `route-voice-reports/${routeId}/stops/${stopId}/${reportId}/audio.${input.extension}`
}

/** Legacy path helper for fixtures / read-path tests only. */
export function generateLegacyRouteVoiceReportBlobName(input: {
  routeId: string
  reportId: string
  extension: RouteVoiceReportValidatedAudio['extension']
}): string {
  const routeId = assertObjectIdSegment(input.routeId)
  const reportId = assertObjectIdSegment(input.reportId)
  return `route-voice-reports/${routeId}/${reportId}/audio.${input.extension}`
}

const LEGACY_BLOB_NAME_PATTERN =
  /^route-voice-reports\/[a-f0-9]{24}\/[a-f0-9]{24}\/audio\.(webm|ogg|m4a)$/i
const STOP_SCOPED_BLOB_NAME_PATTERN =
  /^route-voice-reports\/[a-f0-9]{24}\/stops\/[A-Za-z0-9._:-]{8,64}\/[a-f0-9]{24}\/audio\.(webm|ogg|m4a)$/i

export function assertValidRouteVoiceReportBlobName(blobName: string): string {
  if (typeof blobName !== 'string') {
    throw new RouteVoiceReportAudioSignatureInvalidException()
  }
  const trimmed = blobName.trim()
  if (
    trimmed.length === 0 ||
    trimmed !== blobName ||
    trimmed.includes('..') ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    throw new RouteVoiceReportAudioSignatureInvalidException()
  }
  if (
    !LEGACY_BLOB_NAME_PATTERN.test(trimmed) &&
    !STOP_SCOPED_BLOB_NAME_PATTERN.test(trimmed)
  ) {
    throw new RouteVoiceReportAudioSignatureInvalidException()
  }
  return trimmed
}

export function parseStopId(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new RouteVoiceReportStopIdRequiredException()
  }
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    throw new RouteVoiceReportStopIdRequiredException()
  }
  return assertSafeStopIdSegment(trimmed)
}

function assertObjectIdSegment(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!/^[a-f0-9]{24}$/.test(trimmed)) {
    throw new RouteVoiceReportAudioSignatureInvalidException()
  }
  return trimmed
}

/** Stop ids are UUIDs (or test fixtures); keep path segments opaque and bounded. */
function assertSafeStopIdSegment(value: string): string {
  const trimmed = value.trim()
  if (
    trimmed.length < 8 ||
    trimmed.length > 64 ||
    !/^[A-Za-z0-9._:-]+$/.test(trimmed) ||
    trimmed.includes('..')
  ) {
    throw new RouteVoiceReportStopInvalidException()
  }
  return trimmed
}

type DetectedMagic = {
  format: RouteVoiceReportAudioFormat
  mimeType: RouteVoiceReportValidatedAudio['mimeType']
  extension: RouteVoiceReportValidatedAudio['extension']
}

function detectAudioMagic(bytes: Buffer): DetectedMagic | null {
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(WEBM_MAGIC)) {
    return { format: 'webm', mimeType: 'audio/webm', extension: 'webm' }
  }
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(OGG_MAGIC)) {
    return { format: 'ogg', mimeType: 'audio/ogg', extension: 'ogg' }
  }
  if (isMp4Family(bytes)) {
    return { format: 'mp4', mimeType: 'audio/mp4', extension: 'm4a' }
  }
  return null
}

/**
 * ISO BMFF / MP4: size(4) + 'ftyp' + brand. Accept common audio-capable brands.
 */
function isMp4Family(bytes: Buffer): boolean {
  if (bytes.length < 12) {
    return false
  }
  const boxType = bytes.subarray(4, 8).toString('ascii')
  if (boxType !== 'ftyp') {
    return false
  }
  const brand = bytes.subarray(8, 12).toString('ascii')
  const allowedBrands = new Set([
    'isom',
    'iso2',
    'mp41',
    'mp42',
    'M4A ',
    'M4B ',
    'M4P ',
    'dash',
    'msdh',
    'M4V ',
  ])
  return allowedBrands.has(brand)
}

function normalizeDeclaredMime(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  const trimmed = raw.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

function isDeclaredMimeCompatible(
  declared: string,
  format: RouteVoiceReportAudioFormat,
): boolean {
  if (!ALLOWED_DECLARED_MIME.has(declared) && !declared.startsWith('audio/')) {
    return false
  }
  if (format === 'webm') {
    return declared.startsWith('audio/webm')
  }
  if (format === 'ogg') {
    return declared.startsWith('audio/ogg') || declared === 'application/ogg'
  }
  // mp4
  return (
    declared.startsWith('audio/mp4') ||
    declared === 'audio/x-m4a' ||
    declared === 'audio/aac' ||
    declared.startsWith('audio/m4a')
  )
}

function extractCodecHint(declared: string | null): string | null {
  if (!declared || !declared.includes('codecs=')) {
    return null
  }
  const match = /codecs=([^;]+)/i.exec(declared)
  if (!match) {
    return null
  }
  const codec = match[1].trim().replace(/^"|"$/g, '').slice(0, 32)
  return codec.length > 0 ? codec : null
}

/** Test helper — generate a fresh report id segment. */
export function newReportObjectIdString(): string {
  // Prefer Mongo ObjectId shape; fall back to hex of UUID.
  try {
    // Lazy require avoided; callers typically use mongodb ObjectId.
    return randomUUID().replace(/-/g, '').slice(0, 24)
  } catch {
    return randomUUID().replace(/-/g, '').slice(0, 24)
  }
}
