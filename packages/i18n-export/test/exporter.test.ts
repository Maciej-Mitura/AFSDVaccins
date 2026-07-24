import {
  mkdtemp,
  readFile,
  rename as realRename,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Credentials } from 'google-auth-library'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  authorizeGoogleSheets,
  clearPersistedToken,
  credentialsToPersistedToken,
  loadPersistedToken,
  savePersistedToken,
  SHEETS_READONLY_SCOPE,
  SHEETS_READWRITE_SCOPE,
  tokenSatisfiesAuthMode,
} from '../src/authorize.js'
import type { SheetsAuthClient } from '../src/auth-types.js'
import {
  replaceFilesAtomically,
  writeValidatedLocaleFiles,
} from '../src/generate-translations.js'
import { PACKAGE_ROOT, resolveFromPackageRoot } from '../src/paths.js'
import {
  readSupportedLocaleTabs,
  type SheetReader,
} from '../src/sheet-reader.js'
import {
  formatLocaleJson,
  isBlankCell,
  isRecognizedHeaderRow,
  isValidTranslationKey,
  placeholdersEqualMultiset,
  toSortedMessageMap,
  TranslationValidationError,
  validateTranslationLocales,
  type LocaleTranslations,
} from '../src/translation-validator.js'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'i18n-export-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  vi.restoreAllMocks()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

const HEADER_NL = ['Key', 'Default', 'nl']
const HEADER_EN = ['Key', 'Default', 'en']

describe('translation key format', () => {
  it('accepts domain dot-notation keys', () => {
    expect(isValidTranslationKey('common.save')).toBe(true)
    expect(isValidTranslationKey('auth.login.title')).toBe(true)
    expect(isValidTranslationKey('bezorger.route.today.title')).toBe(true)
    expect(isValidTranslationKey('common.save-draft')).toBe(true)
    expect(isValidTranslationKey('common.save_draft')).toBe(true)
  })

  it('rejects malformed keys', () => {
    expect(isValidTranslationKey('.common.save')).toBe(false)
    expect(isValidTranslationKey('common.save.')).toBe(false)
    expect(isValidTranslationKey('common..save')).toBe(false)
    expect(isValidTranslationKey('common save')).toBe(false)
    expect(isValidTranslationKey('common')).toBe(false)
    expect(isValidTranslationKey('')).toBe(false)
  })
})

describe('cell blankness', () => {
  it('does not treat 0 or false as empty', () => {
    expect(isBlankCell(0)).toBe(false)
    expect(isBlankCell(false)).toBe(false)
    expect(isBlankCell('0')).toBe(false)
    expect(isBlankCell('')).toBe(true)
    expect(isBlankCell('   ')).toBe(true)
    expect(isBlankCell(null)).toBe(true)
    expect(isBlankCell(undefined)).toBe(true)
  })
})

describe('header recognition', () => {
  it('accepts teacher-compatible Key | Default | {locale}', () => {
    expect(isRecognizedHeaderRow(['Key', 'Default', 'en'], 'en')).toBe(true)
    expect(isRecognizedHeaderRow(['Key', 'Default', 'nl'], 'nl')).toBe(true)
  })

  it('accepts trimmed / mixed-case equivalents', () => {
    expect(isRecognizedHeaderRow(['  key ', ' DEFAULT', ' EN '], 'en')).toBe(
      true,
    )
    expect(isRecognizedHeaderRow(['Key', 'default', 'NL'], 'nl')).toBe(true)
  })

  it('accepts legacy Key | Default | Translation', () => {
    expect(isRecognizedHeaderRow(['Key', 'Default', 'Translation'], 'en')).toBe(
      true,
    )
    expect(isRecognizedHeaderRow(['key', 'default', 'translation'], 'nl')).toBe(
      true,
    )
  })

  it('rejects wrong locale code in the third column', () => {
    expect(isRecognizedHeaderRow(['Key', 'Default', 'nl'], 'en')).toBe(false)
    expect(isRecognizedHeaderRow(['Key', 'Default', 'en'], 'nl')).toBe(false)
  })

  it('rejects unrelated third-column headers', () => {
    expect(isRecognizedHeaderRow(['Key', 'Default', 'Value'], 'en')).toBe(false)
    expect(isRecognizedHeaderRow(['Key', 'Default', 'English'], 'en')).toBe(
      false,
    )
    expect(isRecognizedHeaderRow(['common.save', 'x', 'Opslaan'], 'nl')).toBe(
      false,
    )
    expect(isRecognizedHeaderRow(['Name', 'Default', 'nl'], 'nl')).toBe(false)
  })
})

describe('placeholders as multisets', () => {
  it('requires matching multiplicity', () => {
    expect(
      placeholdersEqualMultiset('Hi {user} {user}', 'Hello {user} {user}'),
    ).toBe(true)
    expect(placeholdersEqualMultiset('Hi {user} {user}', 'Hello {user}')).toBe(
      false,
    )
    expect(placeholdersEqualMultiset('A {a} {b}', 'B {b} {a}')).toBe(true)
  })
})

describe('validateTranslationLocales', () => {
  it('accepts valid trimmed rows and skips empty trailing rows', () => {
    const locales = validateTranslationLocales([
      {
        locale: 'nl',
        values: [
          HEADER_NL,
          ['  common.save  ', 'Save', '  Opslaan  '],
          ['auth.login.title', 'Log in', 'Inloggen'],
          [],
          ['', '', ''],
        ],
      },
      {
        locale: 'en',
        values: [
          HEADER_EN,
          ['common.save', 'Save', 'Save'],
          ['auth.login.title', 'Log in', 'Log in'],
          [],
        ],
      },
    ])

    expect(locales).toHaveLength(2)
    expect(locales[0]?.byKey.get('common.save')?.translation).toBe('Opslaan')
    expect(locales[0]?.byKey.get('common.save')?.usedFallback).toBe(false)
  })

  it('uses locale translation when column C is present', () => {
    const locales = validateTranslationLocales([
      {
        locale: 'nl',
        values: [HEADER_NL, ['title.dashboard', 'Dashboard', 'Dashboard NL']],
      },
      {
        locale: 'en',
        values: [HEADER_EN, ['title.dashboard', 'Dashboard', 'Dashboard']],
      },
    ])
    expect(locales[0]?.byKey.get('title.dashboard')?.translation).toBe(
      'Dashboard NL',
    )
    expect(locales[0]?.fallbackCount).toBe(0)
  })

  it('falls back to Default when locale translation is blank', () => {
    const locales = validateTranslationLocales([
      {
        locale: 'nl',
        values: [HEADER_NL, ['title.dashboard', 'Dashboard', '']],
      },
      {
        locale: 'en',
        values: [HEADER_EN, ['title.dashboard', 'Dashboard', 'Dashboard']],
      },
    ])
    expect(locales[0]?.byKey.get('title.dashboard')?.translation).toBe(
      'Dashboard',
    )
    expect(locales[0]?.byKey.get('title.dashboard')?.usedFallback).toBe(true)
    expect(locales[0]?.fallbackCount).toBe(1)
    expect(locales[1]?.fallbackCount).toBe(0)
  })

  it('falls back to Default when locale translation is whitespace only', () => {
    const locales = validateTranslationLocales([
      {
        locale: 'nl',
        values: [HEADER_NL, ['title.dashboard', 'Dashboard', '   ']],
      },
      {
        locale: 'en',
        values: [HEADER_EN, ['title.dashboard', 'Dashboard', 'Dashboard']],
      },
    ])
    expect(locales[0]?.byKey.get('title.dashboard')?.translation).toBe(
      'Dashboard',
    )
    expect(locales[0]?.byKey.get('title.dashboard')?.usedFallback).toBe(true)
  })

  it('rejects when both Default and locale translation are blank', () => {
    expect(() =>
      validateTranslationLocales([
        {
          locale: 'nl',
          values: [HEADER_NL, ['title.dashboard', '', '']],
        },
        {
          locale: 'en',
          values: [HEADER_EN, ['title.dashboard', 'Dashboard', 'Dashboard']],
        },
      ]),
    ).toThrow(
      /Both Default \(column B\) and locale translation \(column C\) are blank/,
    )
  })

  it('rejects when Default is blank even if locale translation is present', () => {
    expect(() =>
      validateTranslationLocales([
        {
          locale: 'nl',
          values: [HEADER_NL, ['title.dashboard', '', 'Dashboard NL']],
        },
        {
          locale: 'en',
          values: [HEADER_EN, ['title.dashboard', 'Dashboard', 'Dashboard']],
        },
      ]),
    ).toThrow(/Default \(column B\) is required/)
  })

  it('validates placeholders against effective fallback values', () => {
    const locales = validateTranslationLocales([
      {
        locale: 'nl',
        values: [HEADER_NL, ['account.welcome', 'Hello, {user}', '']],
      },
      {
        locale: 'en',
        values: [
          HEADER_EN,
          ['account.welcome', 'Hello, {user}', 'Hello, {user}'],
        ],
      },
    ])
    expect(locales[0]?.byKey.get('account.welcome')?.translation).toBe(
      'Hello, {user}',
    )
  })

  it('rejects placeholder mismatch in an explicit locale translation', () => {
    expect(() =>
      validateTranslationLocales([
        {
          locale: 'nl',
          values: [
            HEADER_NL,
            ['account.welcome', 'Hello, {user}', 'Hallo {user} {user}'],
          ],
        },
        {
          locale: 'en',
          values: [
            HEADER_EN,
            ['account.welcome', 'Hello, {user}', 'Hello, {user}'],
          ],
        },
      ]),
    ).toThrow(/Placeholder multiset mismatch/)
  })

  it('reports fallback counts per locale', () => {
    const locales = validateTranslationLocales([
      {
        locale: 'nl',
        values: [
          HEADER_NL,
          ['a.one', 'One', ''],
          ['a.two', 'Two', 'Twee'],
          ['a.three', 'Three', ''],
        ],
      },
      {
        locale: 'en',
        values: [
          HEADER_EN,
          ['a.one', 'One', ''],
          ['a.two', 'Two', 'Two'],
          ['a.three', 'Three', 'Three'],
        ],
      },
    ])
    expect(locales.find(l => l.locale === 'nl')?.fallbackCount).toBe(2)
    expect(locales.find(l => l.locale === 'en')?.fallbackCount).toBe(1)
  })

  it('rejects duplicate keys with both row numbers', () => {
    try {
      validateTranslationLocales([
        {
          locale: 'nl',
          values: [
            HEADER_NL,
            ['common.save', 'Save', 'Opslaan'],
            ['common.save', 'Save', 'Bewaren'],
          ],
        },
        {
          locale: 'en',
          values: [HEADER_EN, ['common.save', 'Save', 'Save']],
        },
      ])
      expect.fail('expected validation error')
    } catch (error) {
      expect(error).toBeInstanceOf(TranslationValidationError)
      expect((error as TranslationValidationError).message).toContain(
        'rows 2 and 3',
      )
    }
  })

  it('rejects blank Default/translation and invalid keys', () => {
    expect(() =>
      validateTranslationLocales([
        {
          locale: 'nl',
          values: [HEADER_NL, ['common.save', '', ''], ['bad key', 'X', 'X']],
        },
        {
          locale: 'en',
          values: [
            HEADER_EN,
            ['common.save', 'Save', 'Save'],
            ['bad.key', 'X', 'X'],
          ],
        },
      ]),
    ).toThrow(/blank|Invalid translation key/i)
  })

  it('lists keys missing from each locale', () => {
    try {
      validateTranslationLocales([
        {
          locale: 'nl',
          values: [
            HEADER_NL,
            ['common.save', 'Save', 'Opslaan'],
            ['common.cancel', 'Cancel', 'Annuleren'],
          ],
        },
        {
          locale: 'en',
          values: [
            HEADER_EN,
            ['common.save', 'Save', 'Save'],
            ['common.delete', 'Delete', 'Delete'],
          ],
        },
      ])
      expect.fail('expected validation error')
    } catch (error) {
      const message = (error as TranslationValidationError).message
      expect(message).toContain('common.delete')
      expect(message).toContain('common.cancel')
    }
  })

  it('rejects unrecognized headers instead of skipping blindly', () => {
    expect(() =>
      validateTranslationLocales([
        {
          locale: 'nl',
          values: [
            ['common.save', 'Save', 'Opslaan'],
            ['common.cancel', 'Cancel', 'Annuleren'],
          ],
        },
        {
          locale: 'en',
          values: [
            ['common.save', 'Save', 'Save'],
            ['common.cancel', 'Cancel', 'Cancel'],
          ],
        },
      ]),
    ).toThrow(/\[nl\] row 1 expected headers Key \| Default \| nl/)
  })

  it('rejects en tab when third header is nl', () => {
    expect(() =>
      validateTranslationLocales([
        {
          locale: 'nl',
          values: [HEADER_NL, ['common.save', 'Save', 'Opslaan']],
        },
        {
          locale: 'en',
          values: [
            ['Key', 'Default', 'nl'],
            ['common.save', 'Save', 'Save'],
          ],
        },
      ]),
    ).toThrow(
      /\[en\] row 1 expected headers Key \| Default \| en.*got Key \| Default \| nl/,
    )
  })

  it('accepts legacy Translation third header via validateTranslationLocales', () => {
    const locales = validateTranslationLocales([
      {
        locale: 'nl',
        values: [
          ['Key', 'Default', 'Translation'],
          ['common.save', 'Save', 'Opslaan'],
        ],
      },
      {
        locale: 'en',
        values: [
          ['Key', 'Default', 'Translation'],
          ['common.save', 'Save', 'Save'],
        ],
      },
    ])
    expect(locales).toHaveLength(2)
  })

  it('does not write output when validation fails', async () => {
    const dir = await makeTempDir()
    const distDir = path.join(dir, 'dist')
    const pwaDir = path.join(dir, 'pwa')

    expect(() =>
      validateTranslationLocales([
        {
          locale: 'nl',
          values: [HEADER_NL, ['common.save', 'Save', 'Opslaan']],
        },
        {
          locale: 'en',
          values: [HEADER_EN, ['common.other', 'Other', 'Other']],
        },
      ]),
    ).toThrow(TranslationValidationError)

    await expect(
      readFile(path.join(pwaDir, 'nl.json'), 'utf8'),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await expect(
      readFile(path.join(distDir, 'en.json'), 'utf8'),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('produces deterministic alphabetical JSON wrappers with effective values only', () => {
    const locales = validateTranslationLocales([
      {
        locale: 'nl',
        values: [
          HEADER_NL,
          ['z.last', 'Last', ''],
          ['a.first', 'First', 'Eerst'],
        ],
      },
      {
        locale: 'en',
        values: [
          HEADER_EN,
          ['z.last', 'Last', 'Last'],
          ['a.first', 'First', 'First'],
        ],
      },
    ])

    const nl = locales.find(l => l.locale === 'nl') as LocaleTranslations
    const messages = toSortedMessageMap(nl)
    expect(Object.keys(messages)).toEqual(['a.first', 'z.last'])
    expect(messages).toEqual({ 'a.first': 'Eerst', 'z.last': 'Last' })
    expect(formatLocaleJson('nl', messages)).toBe(
      `${JSON.stringify({ nl: { 'a.first': 'Eerst', 'z.last': 'Last' } }, null, 2)}\n`,
    )
    expect(formatLocaleJson('nl', messages)).not.toContain('usedFallback')
    expect(formatLocaleJson('nl', messages)).not.toContain('rowNumber')
  })
})

describe('path resolution', () => {
  it('resolves relative paths against the package root', () => {
    expect(resolveFromPackageRoot('./credentials.json')).toBe(
      path.join(PACKAGE_ROOT, 'credentials.json'),
    )
    expect(resolveFromPackageRoot('token.json')).toBe(
      path.join(PACKAGE_ROOT, 'token.json'),
    )
  })

  it('keeps absolute paths absolute', () => {
    const absolute = path.resolve(os.tmpdir(), 'creds.json')
    expect(resolveFromPackageRoot(absolute)).toBe(path.normalize(absolute))
  })
})

describe('token persistence', () => {
  it('saves and loads only safe persisted fields', async () => {
    const dir = await makeTempDir()
    const tokenPath = path.join(dir, 'token.json')
    await savePersistedToken(tokenPath, {
      refresh_token: 'refresh-value',
      access_token: 'access-value',
      expiry_date: 1_700_000_000_000,
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    })

    const loaded = await loadPersistedToken(tokenPath)
    expect(loaded).toEqual({
      refresh_token: 'refresh-value',
      access_token: 'access-value',
      expiry_date: 1_700_000_000_000,
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    })

    const raw = await readFile(tokenPath, 'utf8')
    expect(raw).not.toContain('client_secret')
  })

  it('rejects credentials without refresh_token', () => {
    const credentials: Credentials = {
      access_token: 'only-access',
    }
    expect(() => credentialsToPersistedToken(credentials)).toThrow(
      /refresh_token/,
    )
  })

  it('treats invalid cached JSON as a cache miss', async () => {
    const dir = await makeTempDir()
    const tokenPath = path.join(dir, 'token.json')
    await writeFile(tokenPath, '{not-json', 'utf8')
    expect(await loadPersistedToken(tokenPath)).toBeNull()
  })

  it('falls back to browser auth when cached token refresh fails', async () => {
    const dir = await makeTempDir()
    const credentialsPath = path.join(dir, 'credentials.json')
    const tokenPath = path.join(dir, 'token.json')

    await writeFile(
      credentialsPath,
      JSON.stringify({
        installed: {
          client_id: 'client-id',
          client_secret: 'client-secret',
          redirect_uris: ['http://localhost'],
        },
      }),
      'utf8',
    )
    await savePersistedToken(tokenPath, {
      refresh_token: 'stale-refresh',
      scope: SHEETS_READONLY_SCOPE,
    })

    const browserClient: SheetsAuthClient = {
      credentials: {
        refresh_token: 'new-refresh',
        access_token: 'new-access',
        expiry_date: Date.now() + 60_000,
      },
      getAccessToken: () => Promise.resolve({ token: 'new-access' }),
    }

    const runBrowserAuth = vi.fn(() => Promise.resolve(browserClient))
    let createCalls = 0

    const client = await authorizeGoogleSheets({
      credentialsPath,
      tokenPath,
      runBrowserAuth,
      createClient: (_id, _secret, token) => {
        createCalls += 1
        if (createCalls === 1) {
          const failing: SheetsAuthClient = {
            credentials: { refresh_token: token.refresh_token },
            getAccessToken: () => Promise.reject(new Error('invalid_grant')),
          }
          return failing
        }
        const ok: SheetsAuthClient = {
          credentials: {
            refresh_token: token.refresh_token,
            access_token: token.access_token,
          },
          getAccessToken: () => Promise.resolve({ token: token.access_token }),
        }
        return ok
      },
    })

    expect(runBrowserAuth).toHaveBeenCalledOnce()
    expect(client.credentials.refresh_token).toBe('new-refresh')
    expect(await loadPersistedToken(tokenPath)).toMatchObject({
      refresh_token: 'new-refresh',
    })
  })

  it('persists tokens returned from browser auth on cache miss', async () => {
    const dir = await makeTempDir()
    const credentialsPath = path.join(dir, 'credentials.json')
    const tokenPath = path.join(dir, 'token.json')

    await writeFile(
      credentialsPath,
      JSON.stringify({
        installed: {
          client_id: 'client-id',
          client_secret: 'client-secret',
          redirect_uris: ['http://localhost'],
        },
      }),
      'utf8',
    )

    const browserClient: SheetsAuthClient = {
      credentials: {
        refresh_token: 'browser-refresh',
        access_token: 'browser-access',
      },
      getAccessToken: () => Promise.resolve({ token: 'browser-access' }),
    }

    const client = await authorizeGoogleSheets({
      credentialsPath,
      tokenPath,
      runBrowserAuth: () => Promise.resolve(browserClient),
    })

    expect(client.credentials.refresh_token).toBe('browser-refresh')
    expect(await loadPersistedToken(tokenPath)).toMatchObject({
      refresh_token: 'browser-refresh',
      access_token: 'browser-access',
    })
  })

  it('clears missing token files safely', async () => {
    const dir = await makeTempDir()
    await expect(
      clearPersistedToken(path.join(dir, 'missing-token.json')),
    ).resolves.toBeUndefined()
  })

  it('treats readonly scope as insufficient for readwrite mode', () => {
    expect(
      tokenSatisfiesAuthMode(
        { refresh_token: 'r', scope: SHEETS_READONLY_SCOPE },
        'readwrite',
      ),
    ).toBe(false)
    expect(
      tokenSatisfiesAuthMode(
        { refresh_token: 'r', scope: SHEETS_READWRITE_SCOPE },
        'readwrite',
      ),
    ).toBe(true)
    expect(
      tokenSatisfiesAuthMode(
        { refresh_token: 'r', scope: SHEETS_READWRITE_SCOPE },
        'readonly',
      ),
    ).toBe(true)
  })

  it('refuses scope upgrade without deleting the cached token', async () => {
    const dir = await makeTempDir()
    const credentialsPath = path.join(dir, 'credentials.json')
    const tokenPath = path.join(dir, 'token.json')

    await writeFile(
      credentialsPath,
      JSON.stringify({
        installed: {
          client_id: 'client-id',
          client_secret: 'client-secret',
          redirect_uris: ['http://localhost'],
        },
      }),
      'utf8',
    )
    await savePersistedToken(tokenPath, {
      refresh_token: 'readonly-refresh',
      scope: SHEETS_READONLY_SCOPE,
    })

    const runBrowserAuth = vi.fn()

    await expect(
      authorizeGoogleSheets({
        credentialsPath,
        tokenPath,
        mode: 'readwrite',
        runBrowserAuth,
      }),
    ).rejects.toThrow(/Manually delete only that ignored token file/)

    expect(runBrowserAuth).not.toHaveBeenCalled()
    expect(await loadPersistedToken(tokenPath)).toMatchObject({
      refresh_token: 'readonly-refresh',
      scope: SHEETS_READONLY_SCOPE,
    })
  })

  it('requests write scope from browser auth when seeding with no cache', async () => {
    const dir = await makeTempDir()
    const credentialsPath = path.join(dir, 'credentials.json')
    const tokenPath = path.join(dir, 'token.json')

    await writeFile(
      credentialsPath,
      JSON.stringify({
        installed: {
          client_id: 'client-id',
          client_secret: 'client-secret',
          redirect_uris: ['http://localhost'],
        },
      }),
      'utf8',
    )

    const browserClient: SheetsAuthClient = {
      credentials: {
        refresh_token: 'write-refresh',
        access_token: 'write-access',
        scope: SHEETS_READWRITE_SCOPE,
      },
      getAccessToken: () => Promise.resolve({ token: 'write-access' }),
    }

    const runBrowserAuth = vi.fn(() => Promise.resolve(browserClient))

    await authorizeGoogleSheets({
      credentialsPath,
      tokenPath,
      mode: 'readwrite',
      runBrowserAuth,
    })

    expect(runBrowserAuth).toHaveBeenCalledWith(credentialsPath, [
      SHEETS_READWRITE_SCOPE,
    ])
    expect(await loadPersistedToken(tokenPath)).toMatchObject({
      refresh_token: 'write-refresh',
      scope: SHEETS_READWRITE_SCOPE,
    })
  })
})

describe('output writing', () => {
  it('writes both locales together and uses wrapper JSON shape', async () => {
    const dir = await makeTempDir()
    const distDir = path.join(dir, 'dist-locales')
    const pwaDir = path.join(dir, 'pwa-locales')

    const locales = validateTranslationLocales([
      {
        locale: 'nl',
        values: [
          HEADER_NL,
          ['common.save', 'Save', 'Opslaan'],
          ['common.cancel', 'Cancel', 'Annuleren'],
        ],
      },
      {
        locale: 'en',
        values: [
          HEADER_EN,
          ['common.cancel', 'Cancel', 'Cancel'],
          ['common.save', 'Save', 'Save'],
        ],
      },
    ])

    const result = await writeValidatedLocaleFiles({
      locales,
      distLocalesDir: distDir,
      pwaLocalesDir: pwaDir,
    })

    expect(result.distFiles).toHaveLength(2)
    const nl = JSON.parse(
      await readFile(path.join(pwaDir, 'nl.json'), 'utf8'),
    ) as {
      nl: Record<string, string>
    }
    const en = JSON.parse(
      await readFile(path.join(distDir, 'en.json'), 'utf8'),
    ) as {
      en: Record<string, string>
    }
    expect(nl).toEqual({
      nl: {
        'common.cancel': 'Annuleren',
        'common.save': 'Opslaan',
      },
    })
    expect(en).toEqual({
      en: {
        'common.cancel': 'Cancel',
        'common.save': 'Save',
      },
    })
    expect(await readFile(path.join(pwaDir, 'nl.json'), 'utf8')).toMatch(/\n$/)
  })

  it('does not leave partial output after a mid-promotion failure', async () => {
    const dir = await makeTempDir()
    const nlPath = path.join(dir, 'nl.json')
    const enPath = path.join(dir, 'en.json')
    await writeFile(nlPath, '{"nl":{"old":"1"}}\n', 'utf8')
    await writeFile(enPath, '{"en":{"old":"1"}}\n', 'utf8')

    let renameCalls = 0
    const rename = (from: string, to: string): Promise<void> => {
      renameCalls += 1
      // 2 backups + first promote succeed; second promote fails.
      if (renameCalls === 4) {
        return Promise.reject(new Error('simulated failure'))
      }
      return realRename(from, to)
    }

    await expect(
      replaceFilesAtomically(
        [
          { targetPath: nlPath, content: '{"nl":{"new":"1"}}\n' },
          { targetPath: enPath, content: '{"en":{"new":"1"}}\n' },
        ],
        { rename },
      ),
    ).rejects.toThrow(/simulated failure/)

    expect(await readFile(nlPath, 'utf8')).toBe('{"nl":{"old":"1"}}\n')
    expect(await readFile(enPath, 'utf8')).toBe('{"en":{"old":"1"}}\n')
  })
})

describe('sheet reader orchestration', () => {
  it('reads both tabs through a mocked reader without network access', async () => {
    const readLocaleTab = vi.fn((_id: string, locale: 'nl' | 'en') =>
      Promise.resolve([
        locale === 'nl' ? HEADER_NL : HEADER_EN,
        [`common.${locale}`, '', locale === 'nl' ? 'NL' : 'EN'],
      ]),
    )
    const reader: SheetReader = { readLocaleTab }

    const sheets = await readSupportedLocaleTabs(reader, 'fake-spreadsheet', [
      'nl',
      'en',
    ])
    expect(sheets).toHaveLength(2)
    expect(readLocaleTab).toHaveBeenCalledTimes(2)
  })
})
