import { applicationDefault, cert } from 'firebase-admin/app'

/**
 * Safe, secret-free errors for Firebase Admin credential resolution.
 * Never include raw JSON, base64, private keys, or client emails.
 */
export class FirebaseCredentialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FirebaseCredentialError'
  }
}

export type ParsedServiceAccount = {
  projectId: string
  clientEmail: string
  privateKey: string
}

export type ResolvedFirebaseCredential =
  | { source: 'env-json'; credential: ReturnType<typeof cert> }
  | {
      source: 'application-default'
      credential: ReturnType<typeof applicationDefault>
    }

const REQUIRED_FIELDS = ['project_id', 'client_email', 'private_key'] as const

/**
 * Detect raw JSON vs base64-encoded JSON without logging contents.
 * Values that trim to `{...}` are treated as raw JSON; otherwise base64 is tried.
 */
export function parseServiceAccountJson(
  raw: string,
): ParsedServiceAccount {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    throw new FirebaseCredentialError(
      'FIREBASE_SERVICE_ACCOUNT_JSON is empty. Provide raw service-account JSON or base64-encoded JSON.',
    )
  }

  let parsed: unknown
  if (trimmed.startsWith('{')) {
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new FirebaseCredentialError(
        'FIREBASE_SERVICE_ACCOUNT_JSON looks like JSON but could not be parsed. Fix the value; file-path fallback is not used when this variable is set.',
      )
    }
  } else {
    let decoded: string
    try {
      decoded = Buffer.from(trimmed, 'base64').toString('utf8')
    } catch {
      throw new FirebaseCredentialError(
        'FIREBASE_SERVICE_ACCOUNT_JSON is not valid base64. Provide raw JSON or base64-encoded JSON.',
      )
    }
    if (!decoded.trim().startsWith('{')) {
      throw new FirebaseCredentialError(
        'FIREBASE_SERVICE_ACCOUNT_JSON base64 did not decode to JSON. Fix the value; file-path fallback is not used when this variable is set.',
      )
    }
    try {
      parsed = JSON.parse(decoded)
    } catch {
      throw new FirebaseCredentialError(
        'FIREBASE_SERVICE_ACCOUNT_JSON base64 decoded but JSON parse failed. Fix the value; file-path fallback is not used when this variable is set.',
      )
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FirebaseCredentialError(
      'FIREBASE_SERVICE_ACCOUNT_JSON must be a JSON object with service-account fields.',
    )
  }

  const record = parsed as Record<string, unknown>
  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = record[field]
    return typeof value !== 'string' || value.trim().length === 0
  })

  if (missing.length > 0) {
    throw new FirebaseCredentialError(
      `FIREBASE_SERVICE_ACCOUNT_JSON is missing required fields: ${missing.join(', ')}.`,
    )
  }

  return {
    projectId: (record.project_id as string).trim(),
    clientEmail: (record.client_email as string).trim(),
    privateKey: record.private_key as string,
  }
}

/**
 * Resolve Firebase Admin credentials with deterministic precedence:
 * 1. FIREBASE_SERVICE_ACCOUNT_JSON (raw or base64) → credential.cert()
 * 2. GOOGLE_APPLICATION_CREDENTIALS → applicationDefault()
 * 3. safe failure
 *
 * If FIREBASE_SERVICE_ACCOUNT_JSON is present but malformed, fail clearly
 * without falling back to the file path.
 */
export function resolveFirebaseAdminCredential(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedFirebaseCredential {
  const envJson = env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (typeof envJson === 'string' && envJson.trim().length > 0) {
    const account = parseServiceAccountJson(envJson)
    return {
      source: 'env-json',
      credential: cert({
        projectId: account.projectId,
        clientEmail: account.clientEmail,
        privateKey: account.privateKey,
      }),
    }
  }

  const credentialsPath = env.GOOGLE_APPLICATION_CREDENTIALS
  if (typeof credentialsPath === 'string' && credentialsPath.trim().length > 0) {
    return {
      source: 'application-default',
      credential: applicationDefault(),
    }
  }

  throw new FirebaseCredentialError(
    'Firebase Admin credentials are required: set FIREBASE_SERVICE_ACCOUNT_JSON (Railway/PaaS) or GOOGLE_APPLICATION_CREDENTIALS (local/Compose file path).',
  )
}
