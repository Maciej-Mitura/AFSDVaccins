import { readonly, ref, type Ref } from 'vue'

const needRefresh = ref(false)
const offlineReady = ref(false)

let updateServiceWorkerImpl:
  | ((reloadPage?: boolean) => Promise<void>)
  | null = null

/**
 * Called once from application bootstrap after `registerSW` resolves.
 */
export function configureAppUpdate(options: {
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>
}): void {
  updateServiceWorkerImpl = options.updateServiceWorker
}

export function markAppUpdateAvailable(): void {
  needRefresh.value = true
}

export function markAppOfflineReady(): void {
  offlineReady.value = true
}

export function useAppUpdate(): {
  needRefresh: Readonly<Ref<boolean>>
  offlineReady: Readonly<Ref<boolean>>
  applyUpdate: () => Promise<void>
  dismissUpdate: () => void
} {
  async function applyUpdate(): Promise<void> {
    if (!updateServiceWorkerImpl) {
      return
    }

    await updateServiceWorkerImpl(true)
  }

  function dismissUpdate(): void {
    needRefresh.value = false
  }

  return {
    needRefresh: readonly(needRefresh),
    offlineReady: readonly(offlineReady),
    applyUpdate,
    dismissUpdate,
  }
}

export function __resetAppUpdateForTests(): void {
  needRefresh.value = false
  offlineReady.value = false
  updateServiceWorkerImpl = null
}

/** Test helper: simulate an available service-worker update. */
export function __setNeedRefreshForTests(value: boolean): void {
  needRefresh.value = value
}
