import { authenticate } from '@google-cloud/local-auth'
import { promises as fs } from 'node:fs'
import { OAuth2Client, type Credentials } from 'google-auth-library'

import type { SheetsAuthClient } from './auth-types.js'

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

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
  /** Injected for tests — browser OAuth when cache miss. */
  runBrowserAuth?: (credentialsPath: string) => Promise<SheetsAuthClient>
  /** Injected for tests — build an OAuth2 client from secrets + persisted token. */
  createClient?: (
    clientId: string,
    clientSecret: string,
    token: PersistedOAuthToken,
  ) => SheetsAuthClient
}

async function defaultBrowserAuth(
  credentialsPath: string,
): Promise<SheetsAuthClient> {
  const client = await authenticate({
    scopes: SCOPES,
    keyfilePath: credentialsPath,
  })
  return client
}

/**
 * Authorize a Sheets-readonly OAuth2 client.
 * Uses cached refresh tokens when valid; otherwise opens the desktop browser flow.
 * Never logs secrets or token material.
 */
export async function authorizeGoogleSheets(
  options: AuthorizeOptions,
): Promise<SheetsAuthClient> {
  const { clientId, clientSecret } = await readDesktopClientSecrets(
    options.credentialsPath,
  )
  const runBrowserAuth = options.runBrowserAuth ?? defaultBrowserAuth
  const createClient = options.createClient ?? createClientFromSecrets

  const cached = await loadPersistedToken(options.tokenPath)
  if (cached) {
    const client = createClient(clientId, clientSecret, cached)
    try {
      await refreshOrThrow(client)
      const refreshed = credentialsToPersistedToken(client.credentials)
      await savePersistedToken(options.tokenPath, refreshed)
      return client
    } catch {
      await clearPersistedToken(options.tokenPath)
      // Fall through to browser login.
    }
  }

  const browserClient = await runBrowserAuth(options.credentialsPath)
  const persisted = credentialsToPersistedToken(browserClient.credentials)
  await savePersistedToken(options.tokenPath, persisted)

  // Rebuild from secrets + persisted fields so we never rely on library internals.
  return createClient(clientId, clientSecret, persisted)
}
