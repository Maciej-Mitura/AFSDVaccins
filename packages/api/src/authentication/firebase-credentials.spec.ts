import { applicationDefault, cert } from 'firebase-admin/app'

import {
  FirebaseCredentialError,
  parseServiceAccountJson,
  resolveFirebaseAdminCredential,
} from './firebase-credentials'

const validAccount = {
  type: 'service_account',
  project_id: 'demo-project',
  private_key_id: 'key-id',
  private_key:
    '-----BEGIN PRIVATE KEY-----\nMIIEdemo\n-----END PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk@demo-project.iam.gserviceaccount.com',
  client_id: '123',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
}

describe('parseServiceAccountJson', () => {
  it('parses valid raw JSON', () => {
    const parsed = parseServiceAccountJson(JSON.stringify(validAccount))
    expect(parsed.projectId).toBe('demo-project')
    expect(parsed.clientEmail).toContain('firebase-adminsdk')
    expect(parsed.privateKey).toContain('BEGIN PRIVATE KEY')
  })

  it('parses valid base64-encoded JSON', () => {
    const encoded = Buffer.from(JSON.stringify(validAccount), 'utf8').toString(
      'base64',
    )
    const parsed = parseServiceAccountJson(encoded)
    expect(parsed.projectId).toBe('demo-project')
  })

  it('rejects malformed JSON without leaking contents', () => {
    expect(() => parseServiceAccountJson('{not-json')).toThrow(
      FirebaseCredentialError,
    )
    try {
      parseServiceAccountJson('{not-json')
    } catch (error) {
      const message = (error as Error).message
      expect(message).not.toContain('not-json')
      expect(message).toMatch(/could not be parsed|file-path fallback/i)
    }
  })

  it('rejects missing required fields with field names only', () => {
    expect(() =>
      parseServiceAccountJson(JSON.stringify({ project_id: 'only-project' })),
    ).toThrow(/client_email|private_key/)
  })

  it('rejects empty string', () => {
    expect(() => parseServiceAccountJson('   ')).toThrow(/empty/i)
  })
})

describe('resolveFirebaseAdminCredential', () => {
  beforeEach(() => {
    jest.mocked(cert).mockClear()
    jest.mocked(applicationDefault).mockClear()
  })

  it('uses FIREBASE_SERVICE_ACCOUNT_JSON when valid', () => {
    const resolved = resolveFirebaseAdminCredential({
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(validAccount),
      GOOGLE_APPLICATION_CREDENTIALS: '/tmp/ignored.json',
    })

    expect(resolved.source).toBe('env-json')
    expect(cert).toHaveBeenCalledWith({
      projectId: 'demo-project',
      clientEmail: validAccount.client_email,
      privateKey: validAccount.private_key,
    })
    expect(applicationDefault).not.toHaveBeenCalled()
  })

  it('falls back to GOOGLE_APPLICATION_CREDENTIALS / applicationDefault', () => {
    const resolved = resolveFirebaseAdminCredential({
      GOOGLE_APPLICATION_CREDENTIALS: '/run/secrets/firebase-sa.json',
    })

    expect(resolved.source).toBe('application-default')
    expect(applicationDefault).toHaveBeenCalled()
    expect(cert).not.toHaveBeenCalled()
  })

  it('fails clearly when FIREBASE_SERVICE_ACCOUNT_JSON is malformed (no file fallback)', () => {
    expect(() =>
      resolveFirebaseAdminCredential({
        FIREBASE_SERVICE_ACCOUNT_JSON: '{broken',
        GOOGLE_APPLICATION_CREDENTIALS: '/run/secrets/firebase-sa.json',
      }),
    ).toThrow(/file-path fallback is not used/i)
    expect(applicationDefault).not.toHaveBeenCalled()
  })

  it('fails with a secret-free message when no credential source exists', () => {
    expect(() => resolveFirebaseAdminCredential({})).toThrow(
      /FIREBASE_SERVICE_ACCOUNT_JSON|GOOGLE_APPLICATION_CREDENTIALS/,
    )
  })

  it('error messages never include private key or raw JSON', () => {
    const secretJson = JSON.stringify({
      project_id: 'x',
      private_key: 'SUPER_SECRET_PRIVATE_KEY_VALUE',
      client_email: 'secret@example.com',
    })
    try {
      resolveFirebaseAdminCredential({
        FIREBASE_SERVICE_ACCOUNT_JSON: `prefix-${secretJson}`,
      })
      throw new Error('expected resolveFirebaseAdminCredential to throw')
    } catch (error) {
      const message = (error as Error).message
      expect(message).not.toContain('SUPER_SECRET')
      expect(message).not.toContain('secret@example.com')
      expect(message).not.toContain(secretJson)
    }
  })
})
