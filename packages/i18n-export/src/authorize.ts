import { authenticate } from '@google-cloud/local-auth'
import { promises as fs } from 'node:fs'
import { OAuth2Client, type Credentials } from 'google-auth-library'

import type { SheetsAuthClient } from './auth-types.js'

/** Read-only Sheets access — sufficient for `npm run export:i18n`. */
export const SHEETS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets.readonly'

/**
 * Read/write Sheets access — required for explicit Sheet seed/sync only.
 * Broader than readonly; never requested by normal export when a sufficient
 * readonly token already exists.
 */
export const SHEETS_READWRITE_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets'

export type SheetsAuthMode = 'readonly' | 'readwrite'

/** Persisted token fields only — never arbitrary OAuth2Client internals. */
export interface PersistedOAuthToken {
  refresh_token: string
  access_token?: string
  expiry_date?: number
  token_type?: string
  scope?: string
}

interface DesktopOAuthKeyfile {
  installed?: {
    client_id?: string
    client_secret?: string
    redirect_uris?: string[]
  }
  web?: {
    client_id?: string
    client_secret?: string
    redirect_uris?: string[]
  }
}

export function scopesForAuthMode(mode: SheetsAuthMode): string[] {
  return mode === 'readwrite'
    ? [SHEETS_READWRITE_SCOPE]
    : [SHEETS_READONLY_SCOPE]
}

/**
 * Whether a persisted token's scope string satisfies the requested mode.
 * Missing scope is treated as insufficient (force explicit reauthorization).
 */
export function tokenSatisfiesAuthMode(
  token: PersistedOAuthToken,
  mode: SheetsAuthMode,
): boolean {
  const scopes = (token.scope ?? '')
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)

  if (scopes.length === 0) {
    return false
  }

  const hasReadWrite = scopes.includes(SHEETS_READWRITE_SCOPE)
  const hasReadOnly = scopes.includes(SHEETS_READONLY_SCOPE)

  if (mode === 'readwrite') {
    // Full spreadsheets scope only — `.readonly` alone cannot write.
    return hasReadWrite
  }

  // Readonly export accepts either readonly or full spreadsheets (superset).
  return hasReadWrite || hasReadOnly
}

export function scopeUpgradeRequiredMessage(
  tokenPath: string,
  mode: SheetsAuthMode,
): string {
  const needed = scopesForAuthMode(mode).join(' ')
  return (
    `Cached Google OAuth token at ${tokenPath} does not include the required scope(s): ${needed}. ` +
    `OAuth scopes are fixed at consent time — refreshing will not widen them. ` +
    `Manually delete only that ignored token file (do not commit credentials), then re-run this command ` +
    `so the browser consent flow can request the broader scope. ` +
    `Normal export:i18n remains read-only against the Sheets API even when a write-capable token is present.`
  )
}

export async function readDesktopClientSecrets(
  credentialsPath: string,
): Promise<{ clientId: string; clientSecret: string }> {
  const raw = await fs.readFile(credentialsPath, 'utf8')
  let parsed: DesktopOAuthKeyfile
  try {
    parsed = JSON.parse(raw) as DesktopOAuthKeyfile
  } catch {
    throw new Error(
      `Credentials file at ${credentialsPath} is not valid JSON. Replace it with a Desktop OAuth client download.`,
    )
  }

  const keys = parsed.installed ?? parsed.web
  const clientId = keys?.client_id?.trim()
  const clientSecret = keys?.client_secret?.trim()
  if (!clientId || !clientSecret) {
    throw new Error(
      `Credentials file at ${credentialsPath} is missing client_id/client_secret under "installed" or "web".`,
    )
  }
  return { clientId, clientSecret }
}

function isPersistedToken(value: unknown): value is PersistedOAuthToken {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.refresh_token === 'string' && record.refresh_token.length > 0
}

export function credentialsToPersistedToken(
  credentials: Credentials,
): PersistedOAuthToken {
  const refresh = credentials.refresh_token?.trim()
  if (!refresh) {
    throw new Error(
      'OAuth response did not include a refresh_token. ' +
        'Revoke prior consent for this OAuth client in Google Account permissions, ' +
        'then re-run export so Google issues a new offline refresh token. ' +
        'An access_token alone cannot be persisted safely for repeat exports.',
    )
  }

  const persisted: PersistedOAuthToken = { refresh_token: refresh }
  if (typeof credentials.access_token === 'string' && credentials.access_token) {
    persisted.access_token = credentials.access_token
  }
  if (typeof credentials.expiry_date === 'number') {
    persisted.expiry_date = credentials.expiry_date
  }
  if (typeof credentials.token_type === 'string' && credentials.token_type) {
    persisted.token_type = credentials.token_type
  }
  if (typeof credentials.scope === 'string' && credentials.scope) {
    persisted.scope = credentials.scope
  }
  return persisted
}

export async function loadPersistedToken(
  tokenPath: string,
): Promise<PersistedOAuthToken | null> {
  try {
    const raw = await fs.readFile(tokenPath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!isPersistedToken(parsed)) {
      return null
    }
    return {
      refresh_token: parsed.refresh_token,
      ...(typeof parsed.access_token === 'string'
        ? { access_token: parsed.access_token }
        : {}),
      ...(typeof parsed.expiry_date === 'number'
        ? { expiry_date: parsed.expiry_date }
        : {}),
      ...(typeof parsed.token_type === 'string' ? { token_type: parsed.token_type } : {}),
      ...(typeof parsed.scope === 'string' ? { scope: parsed.scope } : {}),
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return null
    }
    if (error instanceof SyntaxError) {
      return null
    }
    throw error
  }
}

export async function savePersistedToken(
  tokenPath: string,
  token: PersistedOAuthToken,
): Promise<void> {
  const payload: PersistedOAuthToken = {
    refresh_token: token.refresh_token,
  }
  if (token.access_token) {
    payload.access_token = token.access_token
  }
  if (typeof token.expiry_date === 'number') {
    payload.expiry_date = token.expiry_date
  }
  if (token.token_type) {
    payload.token_type = token.token_type
  }
  if (token.scope) {
    payload.scope = token.scope
  }

  await fs.writeFile(tokenPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  try {
    await fs.chmod(tokenPath, 0o600)
  } catch {
    // Restrictive modes are best-effort on Windows.
  }
}

export async function clearPersistedToken(tokenPath: string): Promise<void> {
  try {
    await fs.unlink(tokenPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

function createClientFromSecrets(
  clientId: string,
  clientSecret: string,
  token: PersistedOAuthToken,
): SheetsAuthClient {
  const client = new OAuth2Client(clientId, clientSecret)
  client.setCredentials({
    refresh_token: token.refresh_token,
    ...(token.access_token ? { access_token: token.access_token } : {}),
    ...(typeof token.expiry_date === 'number'
      ? { expiry_date: token.expiry_date }
      : {}),
    ...(token.token_type ? { token_type: token.token_type } : {}),
    ...(token.scope ? { scope: token.scope } : {}),
  })
  return client
}

async function refreshOrThrow(client: SheetsAuthClient): Promise<void> {
  try {
    await client.getAccessToken()
  } catch {
    throw new Error('cached_token_invalid')
  }
}

export interface AuthorizeOptions {
  credentialsPath: string
  tokenPath: string
  /**
   * `readonly` — normal export (Sheets values.get only).
   * `readwrite` — explicit Sheet seed/sync commands only.
   * Default: `readonly`.
   */
  mode?: SheetsAuthMode
  /** Injected for tests — browser OAuth when cache miss. */
  runBrowserAuth?: (
    credentialsPath: string,
    scopes: string[],
  ) => Promise<SheetsAuthClient>
  /** Injected for tests — build an OAuth2 client from secrets + persisted token. */
  createClient?: (
    clientId: string,
    clientSecret: string,
    token: PersistedOAuthToken,
  ) => SheetsAuthClient
}

async function defaultBrowserAuth(
  credentialsPath: string,
  scopes: string[],
): Promise<SheetsAuthClient> {
  const client = await authenticate({
    scopes,
    keyfilePath: credentialsPath,
  })
  return client
}

/**
 * Authorize a Google Sheets OAuth2 client.
 * Uses cached refresh tokens when valid and scope-sufficient; otherwise opens
 * the desktop browser flow for the requested mode.
 *
 * Never silently deletes a token merely because a broader scope is needed —
 * that requires an explicit manual delete of the ignored token.json.
 * Never logs secrets or token material.
 */
export async function authorizeGoogleSheets(
  options: AuthorizeOptions,
): Promise<SheetsAuthClient> {
  const mode: SheetsAuthMode = options.mode ?? 'readonly'
  const scopes = scopesForAuthMode(mode)
  const { clientId, clientSecret } = await readDesktopClientSecrets(
    options.credentialsPath,
  )
  const runBrowserAuth = options.runBrowserAuth ?? defaultBrowserAuth
  const createClient = options.createClient ?? createClientFromSecrets

  const cached = await loadPersistedToken(options.tokenPath)
  if (cached) {
    if (!tokenSatisfiesAuthMode(cached, mode)) {
      // Do not unlink — operator must delete token.json intentionally.
      throw new Error(scopeUpgradeRequiredMessage(options.tokenPath, mode))
    }

    const client = createClient(clientId, clientSecret, cached)
    try {
      await refreshOrThrow(client)
      const refreshed = credentialsToPersistedToken(client.credentials)
      await savePersistedToken(options.tokenPath, refreshed)
      return client
    } catch {
      await clearPersistedToken(options.tokenPath)
      // Fall through to browser login (invalid/expired refresh only).
    }
  }

  const browserClient = await runBrowserAuth(options.credentialsPath, scopes)
  const persisted = credentialsToPersistedToken(browserClient.credentials)
  await savePersistedToken(options.tokenPath, persisted)

  // Rebuild from secrets + persisted fields so we never rely on library internals.
  return createClient(clientId, clientSecret, persisted)
}
