/**
 * Frontend auth bypass for Playwright only.
 * Active solely when Vite is built/served with VITE_E2E_AUTH_BYPASS=true.
 * Production builds must omit this flag — the bypass path stays inactive.
 *
 * Session is stored in sessionStorage so SPA reloads / page.goto keep auth
 * without touching real Firebase persistence.
 */

const SESSION_KEY = 'vaccin-e2e-auth-bypass-token'

export const isE2eAuthBypassEnabled = (): boolean =>
  import.meta.env.VITE_E2E_AUTH_BYPASS === 'true' ||
  import.meta.env.VITE_E2E_AUTH_BYPASS === '1'

export type E2eBypassAccount = {
  token: string
  uid: string
  email: string
  displayName: string
}

/** Mirrors API Phase 17 / e2e-auth-bypass identities. */
export const E2E_BYPASS_ACCOUNTS: readonly E2eBypassAccount[] = [
  {
    token: 'e2e-admin',
    uid: 'e2e-firebase-admin',
    email: 'e2e-admin@example.com',
    displayName: 'E2E Admin',
  },
  {
    token: 'e2e-apotheker-1',
    uid: 'e2e-firebase-apotheker-1',
    email: 'e2e-apotheker-1@example.com',
    displayName: 'E2E Apotheker 1',
  },
  {
    token: 'e2e-apotheker-2',
    uid: 'e2e-firebase-apotheker-2',
    email: 'e2e-apotheker-2@example.com',
    displayName: 'E2E Apotheker 2',
  },
  {
    token: 'e2e-bezorger-1',
    uid: 'e2e-firebase-bezorger-1',
    email: 'e2e-bezorger-1@example.com',
    displayName: 'E2E Bezorger 1',
  },
  {
    token: 'e2e-bezorger-2',
    uid: 'e2e-firebase-bezorger-2',
    email: 'e2e-bezorger-2@example.com',
    displayName: 'E2E Bezorger 2',
  },
] as const

export function findE2eBypassAccountByEmail(
  email: string,
): E2eBypassAccount | undefined {
  const normalized = email.trim().toLowerCase()
  return E2E_BYPASS_ACCOUNTS.find(
    account => account.email.toLowerCase() === normalized,
  )
}

export function findE2eBypassAccountByToken(
  token: string,
): E2eBypassAccount | undefined {
  return E2E_BYPASS_ACCOUNTS.find(account => account.token === token)
}

export type E2eBypassUser = {
  uid: string
  email: string | null
  displayName: string | null
  getIdToken: (forceRefresh?: boolean) => Promise<string>
}

let bypassSession: E2eBypassAccount | null = null
const sessionListeners = new Set<(user: E2eBypassUser | null) => void>()

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_KEY, token)
    } else {
      sessionStorage.removeItem(SESSION_KEY)
    }
  } catch {
    // Ignore storage failures in non-browser/test hosts.
  }
}

function restoreSessionFromStorage(): void {
  if (bypassSession) {
    return
  }

  const token = readStoredToken()
  if (!token) {
    return
  }

  bypassSession = findE2eBypassAccountByToken(token) ?? null
}

function toBypassUser(account: E2eBypassAccount): E2eBypassUser {
  return {
    uid: account.uid,
    email: account.email,
    displayName: account.displayName,
    getIdToken: () => Promise.resolve(account.token),
  }
}

function notifySessionListeners(): void {
  const user = bypassSession ? toBypassUser(bypassSession) : null
  for (const listener of sessionListeners) {
    listener(user)
  }
}

export function getE2eBypassUser(): E2eBypassUser | null {
  restoreSessionFromStorage()
  return bypassSession ? toBypassUser(bypassSession) : null
}

export function subscribeE2eBypassAuth(
  listener: (user: E2eBypassUser | null) => void,
): () => void {
  restoreSessionFromStorage()
  sessionListeners.add(listener)
  listener(getE2eBypassUser())
  return () => {
    sessionListeners.delete(listener)
  }
}

export function e2eBypassLogin(
  email: string,
  password: string,
): E2eBypassUser {
  const account = findE2eBypassAccountByEmail(email)

  if (!account || password.trim().length < 8) {
    const error = new Error(
      'Onjuiste inloggegevens. Controleer e-mail en wachtwoord.',
    ) as Error & { code: string }
    error.code = 'auth/invalid-credential'
    throw error
  }

  bypassSession = account
  writeStoredToken(account.token)
  notifySessionListeners()
  return toBypassUser(account)
}

export function e2eBypassLogout(): void {
  bypassSession = null
  writeStoredToken(null)
  notifySessionListeners()
}

export function resolveE2eBypassBearerToken(): Promise<string | null> {
  restoreSessionFromStorage()
  return Promise.resolve(bypassSession?.token ?? null)
}
