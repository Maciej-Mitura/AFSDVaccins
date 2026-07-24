import type { Credentials } from 'google-auth-library'

/**
 * Minimal auth surface needed by the exporter.
 * Avoids coupling to duplicate `google-auth-library` OAuth2Client type copies
 * pulled in by `googleapis` vs `@google-cloud/local-auth`.
 */
export interface SheetsAuthClient {
  credentials: Credentials
  getAccessToken: () => Promise<unknown>
}
