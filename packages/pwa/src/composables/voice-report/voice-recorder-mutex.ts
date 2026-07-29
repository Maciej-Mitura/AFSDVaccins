/**
 * Global mutex so only one stop-scoped (or legacy) voice recording session
 * can be active at a time across FeatureRouteVoiceRecorder instances.
 */
export type VoiceRecorderMutexKey = string

type MutexHolder = {
  key: VoiceRecorderMutexKey
  cancel: () => void
  hasUnsent: () => boolean
}

let holder: MutexHolder | null = null

export function getActiveVoiceRecorderMutexKey(): VoiceRecorderMutexKey | null {
  return holder?.key ?? null
}

/**
 * Acquire the mic mutex for `key`. If another session holds it, cancel that
 * session after optional unsaved confirmation (same leave policy as route leave).
 * @returns true when this key owns the mutex
 */
export function acquireVoiceRecorderMutex(options: {
  key: VoiceRecorderMutexKey
  cancel: () => void
  hasUnsent: () => boolean
  confirmLeave: () => boolean
}): boolean {
  if (holder && holder.key === options.key) {
    holder = {
      key: options.key,
      cancel: options.cancel,
      hasUnsent: options.hasUnsent,
    }
    return true
  }

  if (holder) {
    if (holder.hasUnsent() && !options.confirmLeave()) {
      return false
    }
    holder.cancel()
    holder = null
  }

  holder = {
    key: options.key,
    cancel: options.cancel,
    hasUnsent: options.hasUnsent,
  }
  return true
}

export function releaseVoiceRecorderMutex(key: VoiceRecorderMutexKey): void {
  if (holder?.key === key) {
    holder = null
  }
}

/** Test-only reset. */
export function __resetVoiceRecorderMutexForTests(): void {
  holder = null
}
