import { onMounted, readonly, ref, type Ref } from 'vue'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isInstalled = ref(false)
const canInstall = ref(false)

let listenersAttached = false

function detectStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const mediaStandalone = window.matchMedia(
    '(display-mode: standalone)',
  ).matches
  const iosStandalone =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

  return mediaStandalone || iosStandalone
}

function handleBeforeInstallPrompt(event: Event): void {
  event.preventDefault()
  deferredPrompt.value = event as BeforeInstallPromptEvent
  canInstall.value = !isInstalled.value
}

function handleAppInstalled(): void {
  isInstalled.value = true
  canInstall.value = false
  deferredPrompt.value = null
}

function attachListeners(): void {
  if (typeof window === 'undefined' || listenersAttached) {
    return
  }

  isInstalled.value = detectStandalone()
  canInstall.value = false

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)
  listenersAttached = true
}

export function useAppInstall(): {
  canInstall: Readonly<Ref<boolean>>
  isInstalled: Readonly<Ref<boolean>>
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
} {
  onMounted(() => {
    attachListeners()
  })

  attachListeners()

  async function promptInstall(): Promise<
    'accepted' | 'dismissed' | 'unavailable'
  > {
    const promptEvent = deferredPrompt.value

    if (!promptEvent) {
      return 'unavailable'
    }

    await promptEvent.prompt()
    const choice = await promptEvent.userChoice

    deferredPrompt.value = null
    canInstall.value = false

    if (choice.outcome === 'accepted') {
      isInstalled.value = true
    }

    return choice.outcome
  }

  return {
    canInstall: readonly(canInstall),
    isInstalled: readonly(isInstalled),
    promptInstall,
  }
}

export function __resetAppInstallForTests(): void {
  if (typeof window !== 'undefined' && listenersAttached) {
    window.removeEventListener(
      'beforeinstallprompt',
      handleBeforeInstallPrompt,
    )
    window.removeEventListener('appinstalled', handleAppInstalled)
  }

  listenersAttached = false
  deferredPrompt.value = null
  isInstalled.value = false
  canInstall.value = false
}

/** Test helper: expose install affordance without a real browser prompt. */
export function __setCanInstallForTests(value: boolean): void {
  canInstall.value = value && !isInstalled.value
}
