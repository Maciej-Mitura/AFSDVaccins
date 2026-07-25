import { translate } from '@/i18n/translate'

export function isVaccineImageBrowseable(
  status: string | null | undefined,
): boolean {
  const value = String(status ?? '')
  return value === 'ACCEPTED' || value === 'REVIEW_REQUIRED'
}

export function vaccineImageValidationStatusLabel(status: string): string {
  const value = String(status)
  if (value === 'PENDING_ANALYSIS') {
    return translate('vaccines.image.status.pendingAnalysis')
  }
  if (value === 'ACCEPTED') {
    return translate('vaccines.image.status.accepted')
  }
  if (value === 'REVIEW_REQUIRED') {
    return translate('vaccines.image.status.reviewRequired')
  }
  if (value === 'REJECTED') {
    return translate('vaccines.image.status.rejected')
  }
  if (value === 'ANALYSIS_FAILED') {
    return translate('vaccines.image.status.analysisFailed')
  }
  return translate('common.unknown')
}

export function vaccineImageValidationStatusExplanation(
  status: string,
): string {
  const value = String(status)
  if (value === 'PENDING_ANALYSIS') {
    return translate('vaccines.image.explanation.pendingAnalysis')
  }
  if (value === 'ACCEPTED') {
    return translate('vaccines.image.explanation.accepted')
  }
  if (value === 'REVIEW_REQUIRED') {
    return translate('vaccines.image.explanation.reviewRequired')
  }
  if (value === 'REJECTED') {
    return translate('vaccines.image.explanation.rejected')
  }
  if (value === 'ANALYSIS_FAILED') {
    return translate('vaccines.image.explanation.analysisFailed')
  }
  return translate('common.unknown')
}

export function vaccineImageUploadOutcomeMessage(status: string): string {
  const value = String(status)
  if (value === 'ACCEPTED') {
    return translate('vaccines.image.upload.accepted')
  }
  if (value === 'REVIEW_REQUIRED') {
    return translate('vaccines.image.upload.reviewRequired')
  }
  if (value === 'REJECTED') {
    return translate('vaccines.image.upload.rejected')
  }
  if (value === 'ANALYSIS_FAILED') {
    return translate('vaccines.image.upload.analysisFailed')
  }
  if (value === 'PENDING_ANALYSIS') {
    return translate('vaccines.image.upload.pendingAnalysis')
  }
  return translate('vaccines.image.upload.completed')
}

export function formatVaccineImageConfidence(
  confidence: number | null | undefined,
): string | null {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return null
  }
  const pct = Math.round(Math.min(1, Math.max(0, confidence)) * 100)
  return translate('vaccines.image.confidenceValue', { value: pct })
}

/** Bound tags shown in admin AI details (avoid dumping large lists). */
export function boundVaccineImageTags(
  tags: string[] | null | undefined,
  limit = 8,
): string[] {
  if (!tags || tags.length === 0) {
    return []
  }
  return tags.slice(0, limit)
}
