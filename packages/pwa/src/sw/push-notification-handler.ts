/**
 * Pure push-notification helpers for the service worker.
 * Unit-tested without a real ServiceWorkerGlobalScope.
 */

export type SafePushPayload = {
  notificationId: string
  type: string
  title: string
  body: string
  actionPath?: string | null
  createdAt?: string
}

export type WindowClientLike = {
  visibilityState?: string
  focused?: boolean
  url?: string
  focus?: () => Promise<WindowClientLike>
  navigate?: (url: string) => Promise<WindowClientLike | null>
  postMessage?: (message: unknown) => void
}

export type ClientsLike = {
  matchAll: (options?: {
    type?: 'window' | 'worker' | 'sharedworker' | 'all'
    includeUncontrolled?: boolean
  }) => Promise<readonly WindowClientLike[] | WindowClientLike[]>
  openWindow?: (url: string) => Promise<WindowClientLike | null>
}

const FORBIDDEN_PAYLOAD_KEYS = [
  'endpoint',
  'p256dh',
  'auth',
  'latitude',
  'longitude',
  'password',
  'secret',
] as const

export function parseSafePushPayload(raw: unknown): SafePushPayload | null {
  if (raw == null) {
    return null
  }

  let data: unknown = raw

  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return null
  }

  const record = data as Record<string, unknown>

  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (key in record) {
      return null
    }
  }

  const notificationId = record.notificationId
  const type = record.type
  const title = record.title
  const body = record.body

  if (
    typeof notificationId !== 'string' ||
    typeof type !== 'string' ||
    typeof title !== 'string' ||
    typeof body !== 'string'
  ) {
    return null
  }

  if (
    notificationId.length > 64 ||
    type.length > 64 ||
    title.length > 200 ||
    body.length > 500
  ) {
    return null
  }

  const actionPath =
    typeof record.actionPath === 'string' && record.actionPath.startsWith('/')
      ? record.actionPath.slice(0, 200)
      : null

  const createdAt =
    typeof record.createdAt === 'string'
      ? record.createdAt.slice(0, 40)
      : undefined

  return {
    notificationId,
    type,
    title,
    body,
    actionPath,
    createdAt,
  }
}

/**
 * True when at least one window client is visible (or focused).
 * Used to suppress OS notification while the app shows an in-app toast.
 */
export function hasVisibleClient(
  clients: readonly WindowClientLike[],
): boolean {
  return clients.some(
    client => client.visibilityState === 'visible' || client.focused === true,
  )
}

export async function shouldDisplayOsNotification(
  clientsApi: ClientsLike,
): Promise<boolean> {
  const clients = await clientsApi.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })

  return !hasVisibleClient(clients)
}

export async function focusOrOpenActionPath(
  clientsApi: ClientsLike,
  actionPath: string | null | undefined,
  origin: string,
): Promise<WindowClientLike | null> {
  const path = actionPath && actionPath.startsWith('/') ? actionPath : '/'
  const targetUrl = new URL(path, origin).href

  const clients = await clientsApi.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })

  for (const client of clients) {
    if (client.url && new URL(client.url).origin === origin) {
      if (client.navigate) {
        try {
          await client.navigate(targetUrl)
        } catch {
          // focus anyway
        }
      }

      if (client.focus) {
        return client.focus()
      }

      return client
    }
  }

  if (clientsApi.openWindow) {
    return clientsApi.openWindow(targetUrl)
  }

  return null
}
