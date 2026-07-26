import type {
  OfflineDiagnosticCategory,
  OfflineStorageMode,
  OfflineStorageStatus,
} from '@/offline/types'

let sessionUnlocked = false
let mode: OfflineStorageMode = 'unavailable'
let diagnostic: OfflineDiagnosticCategory = 'unavailable'

export function getOfflineStorageStatus(): OfflineStorageStatus {
  return {
    mode,
    diagnostic,
    sessionUnlocked,
  }
}

export function isOfflineSessionUnlocked(): boolean {
  return sessionUnlocked
}

export function setOfflineSessionUnlocked(unlocked: boolean): void {
  sessionUnlocked = unlocked
  if (!unlocked && mode === 'ready') {
    mode = 'locked'
  } else if (unlocked && (mode === 'locked' || mode === 'ready')) {
    mode = 'ready'
  }
}

export function setOfflineStorageReady(): void {
  mode = sessionUnlocked ? 'ready' : 'locked'
  diagnostic = 'ok'
}

export function setOfflineStorageOnlineOnly(
  category: OfflineDiagnosticCategory,
): void {
  mode = 'online-only'
  diagnostic = category
  // Keep sessionUnlocked as-is; reads still refuse when locked.
}

export function classifyIndexedDbError(
  error: unknown,
): OfflineDiagnosticCategory {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') {
      return 'quota_exceeded'
    }
    if (
      error.name === 'InvalidStateError' ||
      error.name === 'UnknownError' ||
      error.name === 'SecurityError'
    ) {
      return 'private_browsing'
    }
    if (error.name === 'VersionError' || error.name === 'AbortError') {
      return 'migration_failed'
    }
  }

  if (error instanceof Error) {
    if (error.message === 'INDEXED_DB_UNAVAILABLE') {
      return 'unavailable'
    }
    if (/quota/i.test(error.message)) {
      return 'quota_exceeded'
    }
    if (/migrat/i.test(error.message)) {
      return 'migration_failed'
    }
  }

  return 'unknown'
}

/**
 * Safe diagnostic log — categories only, never raw exception text.
 */
export function logOfflineDiagnostic(
  category: OfflineDiagnosticCategory,
  context: string,
): void {
  if (import.meta.env.DEV) {
    console.warn(`[offline-cache] ${context}: ${category}`)
  }
}

export function __resetOfflineStorageStatusForTests(): void {
  sessionUnlocked = false
  mode = 'unavailable'
  diagnostic = 'unavailable'
}
